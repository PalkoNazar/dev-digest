#!/usr/bin/env node
// Step 1 of pr-self-review: collect every open change of the branch, route each file to
// the skills from references/routing.md and write <run>/collect.json.
//
//   node collect-diff.mjs [--base <ref>] [--staged-only]
//
// Prints the run dir on the last stdout line; later steps take it via --run.
import { readdirSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  EXCLUDED, SKILL_DIR, committedDiffHash, git, loadRouting, packageOf, parseArgs,
  parseUnifiedDiff, readJson, readWorkingFile, repoRoot, route, sha256, stateDir, tryGit, writeJson,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const root = repoRoot();
const state = stateDir(root);

// Default base: origin/main when present — a stale local main would drag already-merged
// commits into the diff.
const base = typeof args.base === 'string'
  ? args.base
  : tryGit(['rev-parse', '--verify', '-q', 'origin/main'], { cwd: root }) ? 'origin/main' : 'main';
const head = git(['rev-parse', 'HEAD'], { cwd: root }).trim();
const branch = tryGit(['symbolic-ref', '--short', '-q', 'HEAD'], { cwd: root }) ?? 'HEAD';
const mergeBase = git(['merge-base', base, 'HEAD'], { cwd: root }).trim();
const stagedOnly = args['staged-only'] === true;

const status = git(['status', '--porcelain'], { cwd: root });
const dirty = status.trim().length > 0;

// Working tree (or index) vs merge-base covers commits + staged + unstaged in one diff.
const diffArgs = ['diff', '-U0', '-M', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/'];
const patch = git(stagedOnly ? [...diffArgs, '--cached', mergeBase] : [...diffArgs, mergeBase], { cwd: root });
const files = parseUnifiedDiff(patch);

if (!stagedOnly) {
  const untracked = git(['ls-files', '--others', '--exclude-standard'], { cwd: root })
    .split('\n').filter(Boolean);
  for (const p of untracked) {
    const r = readWorkingFile(root, p);
    if (!r) continue; // vanished, special file, or its dir resolves outside the repo
    // A symlink contributes only its target text (as git would diff it), never the
    // content it points at.
    const buf = r.kind === 'file' ? r.buf : Buffer.from(r.target);
    const binary = buf.includes(0);
    const lines = binary ? [] : buf.toString('utf8').split('\n');
    if (lines.at(-1) === '') lines.pop();
    files.push({
      path: p, oldPath: null, status: '?', binary, removed: [],
      added: lines.map((text, i) => ({ line: i + 1, text })),
    });
  }
}

// diffHash: what the pre-push hook will recompute for the pushed sha. A dirty or
// staged-only review did not see exactly the committed tree, so it can never match.
const committedHash = committedDiffHash(mergeBase, head, root);
const scope = stagedOnly ? 'staged' : 'full';
const diffHash = !dirty && !stagedOnly ? committedHash : `unpushable:${sha256(patch + status)}`;

const routing = loadRouting();
const cacheDir = path.join(state, 'cache');
const out = [];
for (const f of files) {
  const onDisk = f.status === 'D' ? null : readWorkingFile(root, f.path);
  // Symlinks are never handed to a reviewer: its Read tool would follow the link.
  const symlink = onDisk?.kind === 'symlink';
  const excluded = f.binary || symlink || f.status === 'D' || EXCLUDED.some((re) => re.test(f.path));
  const addedText = f.added.map((a) => a.text).join('\n');
  const r = excluded ? { skills: [], groups: [] } : route(f.path, addedText, routing);
  const content = f.status === 'D' ? null
    : symlink ? `symlink:${onDisk.target}` : onDisk ? onDisk.buf.toString('utf8') : '';
  // Cache key = file content + its skill set: same bytes reviewed by the same skills
  // give the same findings, so fix-and-rerun only re-reviews what changed.
  const cacheKey = content === null ? null : sha256(`${r.skills.join(',')}\n${content}`);
  const cacheFile = cacheKey && path.join(cacheDir, `${cacheKey}.json`);
  const cached = cacheFile && existsSync(cacheFile) ? readJson(cacheFile).findings : null;
  out.push({
    path: f.path,
    oldPath: f.status === 'R' ? f.oldPath : null,
    status: f.status,
    package: packageOf(f.path),
    excluded,
    symlink,
    skills: r.skills,
    groups: r.groups,
    cacheKey,
    cached: cached !== null && r.skills.length > 0,
    cachedFindings: cached ?? [],
    added: f.added,
    removed: f.removed,
  });
}

// Skills nobody routes to: the table is stale.
const routed = new Set(routing.rows.flatMap((r) => r.skills));
const unmappedSkills = readdirSync(path.join(root, '.claude', 'skills'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !routed.has(d.name) && !routing.never.includes(d.name))
  .map((d) => d.name);

const commits = git(['log', '--format=%H%x09%s', `${mergeBase}..HEAD`], { cwd: root })
  .split('\n').filter(Boolean)
  .map((l) => {
    const [sha, ...rest] = l.split('\t');
    return { sha, subject: rest.join('\t') };
  })
  .reverse();

const runDir = path.join(state, 'runs', branch.replace(/[^A-Za-z0-9._-]/g, '_'));
rmSync(runDir, { recursive: true, force: true }); // stale plan/review files would leak into this run
const collect = {
  createdAt: new Date().toISOString(),
  root, skillDir: SKILL_DIR, base, mergeBase, head, branch, scope, dirty,
  diffHash, commits, unmappedSkills,
  files: out,
};
writeJson(path.join(runDir, 'collect.json'), collect);

// ---- human summary ----
const reviewed = out.filter((f) => !f.excluded);
console.log(`branch ${branch} · base ${base} (${mergeBase.slice(0, 8)}) · head ${head.slice(0, 8)}${dirty ? ' · DIRTY' : ''}${stagedOnly ? ' · staged-only' : ''}`);
console.log(`${out.length} changed files, ${reviewed.length} in review, ${out.length - reviewed.length} excluded, ${commits.length} commits`);
console.log('');
console.log('| File | Skills | Groups | Cached |');
console.log('|---|---|---|---|');
for (const f of reviewed) {
  console.log(`| \`${f.path}\` | ${f.skills.join(', ') || '— (hard checks only)'} | ${f.groups.join(', ') || '—'} | ${f.cached ? 'yes' : ''} |`);
}
if (unmappedSkills.length) console.log(`\nunmapped skills: ${unmappedSkills.join(', ')}`);
console.log(`\nRUN_DIR=${runDir}`);
