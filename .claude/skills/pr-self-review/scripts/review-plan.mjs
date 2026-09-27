#!/usr/bin/env node
// Step 3 helper: split the not-yet-cached files into reviewer batches, one skill group
// per batch, so each subagent loads only its own skills and sees only its own files.
//
//   node review-plan.mjs --run <dir>     → prints JSON: [{ id, group, skills, files: [{ path, skills }] }]
import path from 'node:path';
import { loadRouting, parseArgs, readJson, writeJson } from './lib.mjs';

const MAX_FILES = 20; // per subagent; bigger batches dilute attention

const args = parseArgs(process.argv.slice(2));
if (typeof args.run !== 'string') {
  console.error('usage: review-plan.mjs --run <dir>');
  process.exit(2);
}
const collect = readJson(path.join(args.run, 'collect.json'));
const routing = loadRouting();
const groupOfSkill = new Map();
for (const row of routing.rows) for (const s of row.skills) groupOfSkill.set(s, row.group);

const batches = [];
for (const group of ['ui', 'backend', 'shared']) {
  const files = collect.files
    .filter((f) => !f.excluded && !f.cached && f.groups.includes(group))
    .map((f) => ({ path: f.path, skills: f.skills.filter((s) => groupOfSkill.get(s) === group) }))
    .filter((f) => f.skills.length);
  for (let i = 0; i < files.length; i += MAX_FILES) {
    const chunk = files.slice(i, i + MAX_FILES);
    batches.push({
      id: `${group}-${i / MAX_FILES + 1}`,
      group,
      skills: [...new Set(chunk.flatMap((f) => f.skills))].sort(),
      files: chunk,
    });
  }
}
writeJson(path.join(args.run, 'plan.json'), batches);
console.log(JSON.stringify({ root: collect.root, mergeBase: collect.mergeBase, batches }, null, 2));
