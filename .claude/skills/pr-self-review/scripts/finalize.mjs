#!/usr/bin/env node
// Step 4 of pr-self-review: ground the reviewers' findings, apply self-review-ignore,
// update the cache, decide the verdict, write verdicts/<sha>.json and <run>/report.md.
//
//   node finalize.mjs --run <dir> [--llm <file.json>]
//
// --llm file: { "reviewedFiles": ["path", …], "findings": [ { group, skill, severity,
//   file, line, rule, evidence, message, fix }, … ] }
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  SEVERITIES, parseArgs, readJson, readWorkingText, severityRank, stateDir, writeJson,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
if (typeof args.run !== 'string') {
  console.error('usage: finalize.mjs --run <dir> [--llm <file.json>]');
  process.exit(2);
}
const collect = readJson(path.join(args.run, 'collect.json'));
const hard = readJson(path.join(args.run, 'hard.json'));
const llm = typeof args.llm === 'string' ? readJson(args.llm) : loadReviews();
const state = stateDir(collect.root);
const byPath = new Map(collect.files.map((f) => [f.path, f]));
const contentCache = new Map();
const content = (p) => {
  if (!contentCache.has(p)) contentCache.set(p, readWorkingText(collect.root, p));
  return contentCache.get(p);
};

// ---- grounding: a reviewer finding survives only on a changed line with real evidence ----
// Same idea as reviewer-core's groundFindings: the model may not invent a location.
const dropped = [];
function ground(f) {
  const file = byPath.get(f.file);
  if (!file || file.excluded) return 'file is not part of the reviewed diff';
  if (!SEVERITIES.includes(f.severity)) return `unknown severity "${f.severity}"`;
  if (['build-broken', 'secret-leak'].includes(f.rule)) return `rule "${f.rule}" is reserved for hard checks`;
  const line = Number(f.line);
  if (!Number.isInteger(line) || !file.added.some((a) => a.line === line)) return `line ${f.line} is not an added/changed line`;
  const evidence = typeof f.evidence === 'string' ? f.evidence.trim() : '';
  if (evidence.length < 8) return 'evidence missing or shorter than 8 chars';
  const lines = (content(f.file) ?? '').split('\n');
  const window = lines.slice(Math.max(0, line - 4), line + 3).join('\n');
  if (!window.includes(evidence)) return 'evidence is not in the file near that line';
  return null;
}

const reviewed = new Set(llm.reviewedFiles ?? []);
const fresh = [];
for (const f of llm.findings ?? []) {
  const reason = ground(f);
  if (reason) dropped.push({ ...f, reason });
  else fresh.push({ ...f, line: Number(f.line), source: f.skill ?? 'reviewer', suppressible: true });
}

// Cached findings: files whose bytes + skill set were already reviewed. They are
// re-grounded because the base (and so the changed-line set) may have moved.
const cachedUsed = [];
for (const file of collect.files) {
  if (!file.cached || reviewed.has(file.path)) continue;
  for (const f of file.cachedFindings) {
    const reason = ground(f);
    if (reason) dropped.push({ ...f, reason: `cached: ${reason}` });
    else cachedUsed.push({ ...f, cached: true });
  }
}

// Store fresh results per reviewed file (including "no findings", which is the common case).
for (const p of reviewed) {
  const file = byPath.get(p);
  if (!file?.cacheKey) continue;
  writeJson(path.join(state, 'cache', `${file.cacheKey}.json`), {
    path: p, skills: file.skills, findings: fresh.filter((f) => f.file === p),
  });
}

// ---- self-review-ignore: `self-review-ignore: <rule> — <reason>` on the finding's line or
// the one above; a file-level finding (no line) accepts it anywhere in the file ----
const IGNORE = /self-review-ignore:\s*([\w-]+)\s*(?:—|–|-|:)\s*(\S.{2,})/;
const suppressed = [];
const kept = [];
for (const f of [...hard.findings, ...fresh, ...cachedUsed]) {
  if (f.suppressible) {
    const lines = (content(f.file) ?? '').split('\n');
    const hit = (f.line ? [lines[f.line - 1], lines[f.line - 2]] : lines)
      .map((l) => (l ? IGNORE.exec(l) : null))
      .find((m) => m && m[1] === f.rule);
    if (hit) {
      suppressed.push({ ...f, ignoreReason: hit[2].replace(/\s*(\*\/|-->|\}\s*)$/, '').trim() });
      continue;
    }
  }
  kept.push(f);
}
kept.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || String(a.file).localeCompare(String(b.file)) || (a.line ?? 0) - (b.line ?? 0));

// ---- verdict ----
const missingBatches = llm.missingBatches ?? [];
const counts = Object.fromEntries(SEVERITIES.map((s) => [s, kept.filter((f) => f.severity === s).length]));
const verdict = counts.critical > 0 ? 'BLOCK' : hard.incomplete || missingBatches.length ? 'INCOMPLETE' : 'PASS';
const pushable = verdict === 'PASS' && collect.scope === 'full' && !collect.dirty;
const record = {
  sha: collect.head, branch: collect.branch, base: collect.base, mergeBase: collect.mergeBase,
  diffHash: collect.diffHash, scope: collect.scope, dirty: collect.dirty,
  verdict, pushable, counts, createdAt: new Date().toISOString(),
  findings: kept, suppressed, droppedCount: dropped.length,
  warnings: hard.warnings, commands: hard.commands.map(({ tail, ...c }) => c),
};
// Only a review of exactly the committed tree may stand as the commit's verdict: a
// dirty/staged-only re-run must not overwrite an earlier clean PASS for the same sha.
const verdictFile = collect.scope === 'full' && !collect.dirty
  ? path.join(state, 'verdicts', `${collect.head}.json`)
  : path.join(args.run, 'verdict.unpushable.json');
writeJson(verdictFile, record);
writeJson(path.join(args.run, 'dropped.json'), dropped);

// ---- report ----
const loc = (f) => `\`${f.file}${f.line ? `:${f.line}` : ''}\``;
const r = [];
r.push(`# Self-review — ${collect.branch} @ ${collect.head.slice(0, 8)}`, '');
r.push(`**Verdict: ${verdict}**${pushable ? ' — push allowed' : ' — push blocked'} · ` +
  SEVERITIES.map((s) => `${counts[s]} ${s}`).join(' · '), '');
if (!pushable && verdict === 'PASS') r.push('_PASS, but reviewed a dirty tree or staged-only scope — commit and re-run to unlock the push._', '');
if (verdict === 'INCOMPLETE') r.push('_Some checks could not run (see Commands) — fix the setup and re-run._', '');
if (missingBatches.length) r.push(`_Reviewer batches without a valid result: ${missingBatches.join(', ')}._`, '');
r.push('## Routing', '', '| File | Skills | Cached |', '|---|---|---|');
for (const f of collect.files.filter((x) => !x.excluded)) {
  r.push(`| \`${f.path}\` | ${f.skills.join(', ') || '— (hard checks only)'} | ${f.cached && !reviewed.has(f.path) ? 'yes' : ''} |`);
}
r.push('', '## Findings', '');
if (!kept.length) r.push('None.');
for (const f of kept) {
  r.push(`- **${f.severity}** \`${f.rule}\` ${loc(f)} _(${f.source}${f.cached ? ', cached' : ''})_ — ${f.message}` +
    (f.fix ? `\n  - fix: ${f.fix}` : ''));
}
if (suppressed.length) {
  r.push('', '## Suppressed by self-review-ignore', '');
  for (const f of suppressed) r.push(`- ${f.severity} \`${f.rule}\` ${loc(f)} — reason: ${f.ignoreReason}`);
}
if (hard.warnings.length) {
  r.push('', '## Warnings', '');
  for (const w of hard.warnings) r.push(`- \`${w.rule}\` — ${w.message}`);
}
r.push('', '## Commands', '');
if (!hard.commands.length) r.push('None (no code in touched packages).');
for (const c of hard.commands) {
  r.push(`- ${c.package}: \`${c.command}\` → **${c.status}**${c.reason ? ` (${c.reason})` : ''}${c.seconds !== undefined ? ` · ${c.seconds}s` : ''}`);
  if (c.tail) r.push('', '```', c.tail, '```');
}
r.push('', `_${dropped.length} reviewer finding(s) dropped by grounding (see \`${path.join(args.run, 'dropped.json')}\`)._`);
r.push(`_Verdict: \`${verdictFile}\`_`);
const report = r.join('\n') + '\n';
writeFileSync(path.join(args.run, 'report.md'), report);
process.stdout.write(report);

/**
 * Reviewer results written by the subagents as <run>/review-<batch id>.json. A file counts
 * as reviewed (and gets cached) only when EVERY batch that holds it returned a valid result,
 * so a failed batch can never be hidden behind a cache hit next time.
 */
function loadReviews() {
  const planFile = path.join(args.run, 'plan.json');
  if (!existsSync(planFile)) return { reviewedFiles: [], findings: [], missingBatches: [] };
  const plan = readJson(planFile);
  const findings = [];
  const missingBatches = [];
  for (const b of plan) {
    let res = null;
    try {
      res = readJson(path.join(args.run, `review-${b.id}.json`));
    } catch { /* missing or not JSON */ }
    if (!res || !Array.isArray(res.findings)) {
      missingBatches.push(b.id);
      continue;
    }
    findings.push(...res.findings.map((f) => ({ group: b.group, ...f })));
  }
  const reviewedFiles = [...new Set(plan.flatMap((b) => b.files.map((f) => f.path)))]
    .filter((p) => plan.every((b) => !b.files.some((f) => f.path === p) || !missingBatches.includes(b.id)));
  return { reviewedFiles, findings, missingBatches };
}
