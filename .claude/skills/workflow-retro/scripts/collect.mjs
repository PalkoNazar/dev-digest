#!/usr/bin/env node
// Facts for a workflow retrospective, read from Claude Code's own session transcripts:
//   ~/.claude/projects/<project>/<session>.jsonl              — the main session
//   ~/.claude/projects/<project>/<session>/subagents/agent-*.jsonl + .meta.json — each subagent
//
//   node .claude/skills/workflow-retro/scripts/collect.mjs                 # latest session of this project
//   node … --session <id | path.jsonl> --since 2026-10-11T15:30 --until … --json
//
// Read-only. Prints counts, timings, tool names, file paths and short error heads —
// never message bodies. Token usage is de-duplicated by message id (one API response
// is logged as several lines, one per content block).

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const asJson = args.includes('--json');
// Transcript timestamps are UTC; a time given without a zone is read as UTC too.
const utc = (v) => Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v}Z`);
const since = opt('since') ? utc(opt('since')) : -Infinity;
const until = opt('until') ? utc(opt('until')) : Infinity;

// ---- locate the session ---------------------------------------------------------
const projectsRoot = join(homedir(), '.claude', 'projects');
const slug = (p) => p.replace(/[^a-zA-Z0-9]/g, '-');
function projectDirs() {
  // the session lives under the directory Claude was started in; from a worktree that
  // is often the main clone, so try the cwd, the main worktree and --project-dir
  const cands = [opt('project-dir'), join(projectsRoot, slug(process.cwd()))];
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      encoding: 'utf8',
    }).trim();
    cands.push(join(projectsRoot, slug(common.replace(/\/\.git$/, ''))));
  } catch {}
  return [...new Set(cands.filter((d) => d && existsSync(d)))];
}
function findSession() {
  const s = opt('session');
  if (s && s.endsWith('.jsonl')) return s;
  for (const dir of projectDirs()) {
    if (s && existsSync(join(dir, `${s}.jsonl`))) return join(dir, `${s}.jsonl`);
  }
  if (s) throw new Error(`session ${s} not found`);
  const all = projectDirs().flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => join(dir, f)),
  );
  if (!all.length) throw new Error('no session transcripts found — pass --session or --project-dir');
  return all.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

// ---- parse ----------------------------------------------------------------------
const readJsonl = (file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

const inWindow = (e) => {
  const t = Date.parse(e.timestamp ?? '');
  return Number.isNaN(t) || (t >= since && t <= until);
};
const contentOf = (e) => (Array.isArray(e.message?.content) ? e.message.content : []);
const textOf = (c) =>
  typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x.text ?? '').join(' ') : String(c ?? '');
const head = (s, n = 140) => textOf(s).replace(/\s+/g, ' ').trim().slice(0, n);

const BLOCK_RE = /Blocked by|denied by the Claude Code|Permission for this action was denied|hook/i;

function analyse(entries) {
  const ev = entries.filter(inWindow);
  const usageById = new Map();
  const tools = {};
  const toolUses = new Map(); // id → {name, input, ts}
  const errors = [];
  const files = new Set();
  let first = null;
  let last = null;
  const models = new Set();
  for (const e of ev) {
    const t = e.timestamp;
    if (t) {
      first ??= t;
      last = t;
    }
    if (e.type === 'assistant' && e.message) {
      if (e.message.model) models.add(e.message.model);
      if (e.message.usage && e.message.id) usageById.set(e.message.id, e.message.usage);
      for (const c of contentOf(e)) {
        if (c.type !== 'tool_use') continue;
        tools[c.name] = (tools[c.name] ?? 0) + 1;
        toolUses.set(c.id, { name: c.name, input: c.input ?? {}, ts: t });
        const fp = c.input?.file_path;
        if (fp && (c.name === 'Read' || c.name === 'Edit' || c.name === 'Write')) files.add(fp);
        if (c.name === 'Bash' && typeof c.input?.command === 'string') {
          // `cat a b`, `sed -n …p file`, `head file` — the common read-only forms
          for (const m of c.input.command.matchAll(/(?:^|[;&|]\s*)(?:cat|head|tail|sed -n \S+)\s+([^;&|<>]+)/g)) {
            for (const w of m[1].split(/\s+/)) if (/[./]/.test(w) && !w.startsWith('-')) files.add(w);
          }
        }
      }
    }
    if (e.type === 'user') {
      for (const c of contentOf(e)) {
        if (c.type === 'tool_result' && c.is_error) {
          const use = toolUses.get(c.tool_use_id);
          const msg = head(c.content);
          errors.push({ tool: use?.name ?? '?', blocked: BLOCK_RE.test(msg), head: msg });
        }
      }
    }
  }
  const tokens = { input: 0, cache_create: 0, cache_read: 0, output: 0 };
  for (const u of usageById.values()) {
    tokens.input += u.input_tokens ?? 0;
    tokens.cache_create += u.cache_creation_input_tokens ?? 0;
    tokens.cache_read += u.cache_read_input_tokens ?? 0;
    tokens.output += u.output_tokens ?? 0;
  }
  // a subagent's final report: its last SubagentHandback message, else its last text
  const finalText = [...ev]
    .reverse()
    .filter((e) => e.type === 'assistant')
    .flatMap((e) =>
      contentOf(e)
        .map((c) => (c.type === 'tool_use' && c.name === 'SubagentHandback' ? c.input?.message : c.type === 'text' ? c.text : null))
        .filter(Boolean),
    )
    .find((x) => x && x.trim());
  const status = finalText?.match(/^\s*Status:\s*([A-Za-z-]+)/m)?.[1] ?? null;
  return { first, last, models: [...models], turns: usageById.size, tokens, tools, errors, files, toolUses, ev, status };
}

// ---- main session + subagents ---------------------------------------------------
const sessionFile = findSession();
const sessionId = basename(sessionFile, '.jsonl');
const main = analyse(readJsonl(sessionFile));

// launches and resumes from the main transcript
const launches = new Map(); // toolUseId → {type, description, ts, background}
const resumes = {}; // agentId → count
for (const [id, u] of main.toolUses) {
  if (u.name === 'Agent' || u.name === 'Task') {
    launches.set(id, {
      type: u.input.subagent_type ?? 'general-purpose',
      description: u.input.description ?? '',
      ts: u.ts,
    });
  }
  if (u.name === 'SendMessage' && u.input.to) resumes[u.input.to] = (resumes[u.input.to] ?? 0) + 1;
}

// user prompts in the window (corrections and interrupts are the strongest retro signal)
// Only prompts the human typed (`origin.kind: human`): not skill bodies, subagent
// hand-backs, background-task notifications or local command output.
const userPrompts = main.ev
  .filter((e) => e.type === 'user' && !e.isMeta && e.origin?.kind === 'human')
  .filter((e) => !contentOf(e).some((c) => c.type === 'tool_result'))
  .map((e) => ({ ts: e.timestamp, head: head(typeof e.message?.content === 'string' ? e.message.content : contentOf(e), 120) }))
  .filter((p) => p.head && !/^(<|## Context Usage|Base directory for this skill)/.test(p.head));

const subDir = join(sessionFile.replace(/\.jsonl$/, ''), 'subagents');
const agents = [];
if (existsSync(subDir)) {
  for (const f of readdirSync(subDir).filter((x) => x.endsWith('.jsonl'))) {
    const agentId = f.replace(/^agent-/, '').replace(/\.jsonl$/, '');
    const metaFile = join(subDir, f.replace(/\.jsonl$/, '.meta.json'));
    const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {};
    const a = analyse(readJsonl(join(subDir, f)));
    if (!a.first) continue; // nothing in the window
    const launch = launches.get(meta.toolUseId) ?? {};
    agents.push({
      agentId,
      type: meta.agentType ?? launch.type ?? '?',
      description: meta.description ?? launch.description ?? '',
      spawnedAt: launch.ts ?? a.first,
      first: a.first,
      last: a.last,
      minutes: +((Date.parse(a.last) - Date.parse(a.first)) / 60000).toFixed(1),
      turns: a.turns,
      resumes: resumes[agentId] ?? 0,
      models: a.models,
      tokens: a.tokens,
      tools: a.tools,
      errors: a.errors.length,
      blocked: a.errors.filter((x) => x.blocked).length,
      errorHeads: a.errors.slice(0, 5),
      status: a.status,
      files: [...a.files],
    });
  }
}
agents.sort((x, y) => Date.parse(x.spawnedAt) - Date.parse(y.spawnedAt));

// parallel groups: agents whose active windows overlap
let group = 0;
let groupEnd = -Infinity;
for (const a of agents) {
  if (Date.parse(a.first) > groupEnd) group++;
  a.group = group;
  groupEnd = Math.max(groupEnd, Date.parse(a.last));
}

// files read by more than one participant → candidate duplicated context
const readers = new Map();
for (const [who, set] of [['main', main.files], ...agents.map((a) => [`${a.type}#${a.agentId.slice(0, 6)}`, new Set(a.files)])]) {
  for (const f of set) readers.set(f, [...(readers.get(f) ?? []), who]);
}
const duplicated = [...readers.entries()]
  .filter(([, w]) => w.length > 1)
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 15)
  .map(([file, who]) => ({ file, readers: who }));

const sum = (ts) => ts.reduce((s, t) => ({
  input: s.input + t.input,
  cache_create: s.cache_create + t.cache_create,
  cache_read: s.cache_read + t.cache_read,
  output: s.output + t.output,
}), { input: 0, cache_create: 0, cache_read: 0, output: 0 });
const total = sum([main.tokens, ...agents.map((a) => a.tokens)]);
const mcp = Object.fromEntries(Object.entries(main.tools).filter(([k]) => k.startsWith('mcp__')));

const report = {
  session: sessionId,
  file: sessionFile,
  window: { from: main.first, to: main.last, since: opt('since') ?? null, until: opt('until') ?? null },
  models: [...new Set([...main.models, ...agents.flatMap((a) => a.models)])],
  tokens: { main: main.tokens, subagents: sum(agents.map((a) => a.tokens)), total },
  main: { turns: main.turns, tools: main.tools, errors: main.errors.length, blocked: main.errors.filter((x) => x.blocked).length, errorHeads: main.errors.slice(0, 8) },
  mcp,
  userPrompts,
  agents: agents.map(({ files, ...rest }) => ({ ...rest, filesTouched: files.length })),
  duplicated,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

// ---- markdown -------------------------------------------------------------------
const k = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const tok = (t) => `in ${k(t.input)} · cache-write ${k(t.cache_create)} · cache-read ${k(t.cache_read)} · out ${k(t.output)}`;
const tools = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n}×${c}`).join(', ') || '—';
const out = [];
out.push(`# Workflow facts — session ${sessionId}`);
out.push(`Window: ${report.window.from} → ${report.window.to}${opt('since') ? ` (filtered from ${opt('since')})` : ''} · models: ${report.models.join(', ')}`);
out.push('', '## Tokens');
out.push(`| Scope | Tokens |`, `|---|---|`);
out.push(`| main session (${main.turns} responses) | ${tok(main.tokens)} |`);
out.push(`| subagents (${agents.length}) | ${tok(report.tokens.subagents)} |`);
out.push(`| **total** | ${tok(total)} |`);
const cacheable = total.input + total.cache_create + total.cache_read;
if (cacheable) out.push('', `Cache hit ratio (cache-read / all input): ${((100 * total.cache_read) / cacheable).toFixed(0)}%`);
out.push('', '## Agents in launch order');
out.push('| # | Group | Agent | Task | Spawned | Min | Turns | Resumed | Tokens | Tools | Errors (blocked) | Status |');
out.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
agents.forEach((a, i) =>
  out.push(`| ${i + 1} | P${a.group} | ${a.type} | ${a.description} | ${a.spawnedAt?.slice(11, 19)} | ${a.minutes} | ${a.turns} | ${a.resumes} | ${tok(a.tokens)} | ${tools(a.tools)} | ${a.errors} (${a.blocked}) | ${a.status ?? '—'} |`),
);
if (!agents.length) out.push('| — | | no subagents in this window | | | | | | | | | |');
out.push('', 'Same group (P<n>) = active windows overlapped (ran in parallel).');
out.push('', '## Main session');
out.push(`Tools: ${tools(main.tools)}`);
out.push(`Errors: ${main.errors.length} (blocked by hook/permission: ${report.main.blocked})`);
for (const e of report.main.errorHeads) out.push(`- ${e.tool}${e.blocked ? ' [blocked]' : ''}: ${e.head}`);
if (Object.keys(mcp).length) out.push('', `External agents / MCP: ${tools(mcp)}`);
out.push('', '## Agent errors');
for (const a of agents) for (const e of a.errorHeads) out.push(`- ${a.type}: ${e.tool}${e.blocked ? ' [blocked]' : ''}: ${e.head}`);
if (!agents.some((a) => a.errorHeads.length)) out.push('- —');
out.push('', '## Files read by more than one participant (duplicated context candidates)');
for (const d of duplicated) out.push(`- \`${d.file}\` — ${d.readers.join(', ')}`);
if (!duplicated.length) out.push('- —');
out.push('', `## User prompts in the window (${userPrompts.length})`);
for (const p of userPrompts) out.push(`- ${p.ts?.slice(11, 19)} — ${p.head}`);
console.log(out.join('\n'));
