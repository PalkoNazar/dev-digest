// Run: node .claude/hooks/readonly-bash.test.mjs
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from './readonly-bash.mjs';

const allowed = [
  'cat server/AGENTS.md client/AGENTS.md',
  "sed -n 1,80p server/src/adapters/git/diff-parser.ts",
  "rg -n 'a > b' server/src",
  'grep -rn "=> x" client/src 2>/dev/null | head -20',
  'git diff --name-status $(git merge-base main HEAD)',
  'git log --oneline -5 && git status --short',
  'git branch --show-current',
  'cd server && pnpm typecheck && pnpm exec vitest run --exclude "**/*.it.test.ts" && pnpm arch:check',
  'cd reviewer-core && npm run typecheck && npm test',
  'pnpm exec depcruise src --config .dependency-cruiser.cjs --output-type err 2>&1',
  'diff -r server/src/vendor/shared client/src/vendor/shared',
  'find server/src -name "*.ts" | wc -l',
  'jq .scripts server/package.json',
  'git ls-files -o --exclude-standard',
  'sort -u specs/a.md | head',
  'git -C server log --oneline -3',
  'git branch -a --contains HEAD',
  'git remote -v',
  'git rev-parse --abbrev-ref HEAD',
  './scripts/check.sh',
  './scripts/check.sh --related server client',
  'scripts/check.sh --it --base origin/main server 2>&1 | tail -20',
  'node --test .claude/skills/pr-self-review/scripts/test/self-review.test.mjs',
];

const blocked = [
  'echo x > file.txt',
  'cat a >> b',
  "sed -i 's/a/b/' x.ts",
  'sed --in-place -e s/a/b/ x.ts',
  'tee out.md < in.md',
  'rm -rf node_modules',
  'git checkout -- server/src/x.ts',
  'git stash',
  'git -C server commit -m x',
  'git branch -D feat/x',
  'pnpm install',
  'npm i left-pad',
  'pnpm db:migrate',
  'cd server && pnpm run db:generate',
  'pnpm arch:baseline',
  'pnpm exec vitest run -u',
  'docker compose down -v',
  'bash -c "rm x"',
  "python3 -c 'open(\"x\",\"w\")'",
  "awk '{print > \"f\"}' a",
  'find . -name "*.tmp" -delete',
  'ls | xargs rm',
  'cat $(rm x)',
  'echo "$(touch x)"',
  './scripts/dev.sh',
  './scripts/e2e.sh',
  './scripts/check.sh > out.txt',
  './scripts/check.sh.bak',
  'scripts/check.sh; rm x',
  'node --test --import ./x.mjs t.test.mjs',
  "node --test -e 'require(\"fs\").writeFileSync(\"x\",\"\")'",
  'node x.mjs',
  'NODE_OPTIONS=--require=./w.js node --test t.test.mjs',
  'node --test "--import=./x.mjs" t.test.mjs',
  "env 'NODE_OPTIONS=--import=./w.mjs' node --test t.test.mjs",
  "env 'BASH_ENV=./w.sh' ./scripts/check.sh",
  '"NODE_OPTIONS=--require=./w.js" node --test t.test.mjs',
  "'rm' -rf x",
  "node --test '-e' 'process.exit()'",
  'node "--test" t.test.mjs',
  'env NODE_OPTIONS=--import=./w.mjs ./scripts/check.sh',
  'BASH_ENV=./w.sh ./scripts/check.sh',
  'LD_PRELOAD=./w.so ./scripts/check.sh',
  'export NODE_OPTIONS=--require=./w.js; node --test t.test.mjs',
  'declare -x BASH_ENV=./w.sh && ./scripts/check.sh',
  'node -e "1"',
  'FOO=1 mv a b',
  'git diff --output=server/src/x.ts',
  'git log -p --output specs/x.md',
  'git format-patch -o out HEAD~1',
  'git archive -o x.tar HEAD',
  'sort -o server/src/x.ts a',
  'tar xf a.tar',
  "git -c 'alias.foo=!touch /tmp/x' foo",
  "git -c core.pager='touch x' log",
  'git --config-env=core.pager=X log',
  'git foo',
  "GIT_PAGER='touch x' git log",
  "env GIT_EXTERNAL_DIFF=x git diff",
  'env FOO=1 rm x',
  'git grep -O vim foo',
  'git branch feat/new',
  'git remote add evil x',
  "env -i sh -c 'touch server/src/x.ts'",
  '/usr/bin/env -i bash -c x',
  'command -p rm x',
  'timeout 5 rm x',
  'nohup touch x',
];

let failed = 0;
for (const c of allowed) {
  const r = check(c);
  if (r) { failed++; console.error(`FAIL allowed but blocked (${r}): ${c}`); }
}
for (const c of blocked) {
  if (!check(c)) { failed++; console.error(`FAIL blocked but allowed: ${c}`); }
}

// End-to-end through stdin, as Claude Code calls it.
const script = fileURLToPath(new URL('./readonly-bash.mjs', import.meta.url));
const run = (command) =>
  spawnSync(process.execPath, [script], { input: JSON.stringify({ tool_input: { command } }) });
if (run('sed -i s/a/b/ x').status !== 2) { failed++; console.error('FAIL e2e: write not blocked with exit 2'); }
if (run('cat README.md').status !== 0) { failed++; console.error('FAIL e2e: read blocked'); }

// A path with a space must still be recognised as the entry point (no fail-open).
const spaced = mkdtempSync(path.join(tmpdir(), 'hook with space-'));
copyFileSync(script, path.join(spaced, 'readonly-bash.mjs'));
const spacedRun = spawnSync(process.execPath, [path.join(spaced, 'readonly-bash.mjs')], {
  input: JSON.stringify({ tool_input: { command: 'rm x' } }),
});
if (spacedRun.status !== 2) { failed++; console.error('FAIL e2e: hook fails open on a path with a space'); }
rmSync(spaced, { recursive: true, force: true });

console.log(failed ? `${failed} failed` : `ok: ${allowed.length} allowed, ${blocked.length} blocked, e2e ok`);
process.exit(failed ? 1 : 0);
