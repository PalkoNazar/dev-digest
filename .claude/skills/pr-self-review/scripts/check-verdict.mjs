#!/usr/bin/env node
// pre-push gate: allow the push only when every pushed sha has a fresh PASS verdict.
// Reads git's pre-push stdin: "<local ref> <local sha> <remote ref> <remote sha>" per line.
// Never runs a review itself — it only reads verdicts/<sha>.json.
//
// Bypass: SKIP_SELF_REVIEW=1 git push   (optional SKIP_SELF_REVIEW_REASON="…"), logged.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { committedDiffHash, readJson, stateDir, tryGit } from './lib.mjs';

const ZERO = /^0+$/;
const input = readFileSync(0, 'utf8');
const state = stateDir();
const updates = input.split('\n').filter(Boolean).map((l) => {
  const [localRef, localSha, remoteRef] = l.split(' ');
  return { localRef, localSha, remoteRef };
}).filter((u) => !ZERO.test(u.localSha) && !u.localRef.startsWith('refs/tags/'));

if (!updates.length) process.exit(0);

if (process.env.SKIP_SELF_REVIEW === '1') {
  const reason = process.env.SKIP_SELF_REVIEW_REASON ?? '';
  for (const u of updates) {
    appendFileSync(path.join(state, 'bypass.log'),
      `${new Date().toISOString()}\t${u.localSha}\t${u.localRef}\t${u.remoteRef}\t${reason}\n`);
  }
  console.error(`pr-self-review: BYPASSED (SKIP_SELF_REVIEW=1) — logged to ${path.join(state, 'bypass.log')}`);
  process.exit(0);
}

const problems = [];
for (const u of updates) {
  const name = u.localRef.replace('refs/heads/', '');
  const file = path.join(state, 'verdicts', `${u.localSha}.json`);
  if (!existsSync(file)) {
    problems.push(`${name} @ ${u.localSha.slice(0, 8)}: no self-review for this commit`);
    continue;
  }
  const v = readJson(file);
  if (v.scope !== 'full' || v.dirty) {
    problems.push(`${name}: the review saw uncommitted or staged-only changes — commit and re-run`);
  } else if (tryGit(['cat-file', '-e', v.mergeBase]) === null || committedDiffHash(v.mergeBase, u.localSha) !== v.diffHash) {
    problems.push(`${name}: the verdict is stale (diff changed since the review)`);
  } else if (v.verdict !== 'PASS') {
    const c = v.counts ?? {};
    problems.push(`${name}: verdict ${v.verdict}${v.verdict === 'BLOCK' ? ` — ${c.critical} critical finding(s)` : ''}`);
  }
}

if (problems.length) {
  console.error('pr-self-review: push blocked');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('Run /pr-self-review in Claude Code, fix the critical findings, then push again.');
  console.error('Bypass (logged): SKIP_SELF_REVIEW=1 git push');
  process.exit(1);
}
console.error('pr-self-review: PASS verdict found — pushing.');
