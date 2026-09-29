// Run: node .claude/hooks/readonly-bash.test.mjs
import { spawnSync } from 'node:child_process';
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
  'FOO=1 mv a b',
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

console.log(failed ? `${failed} failed` : `ok: ${allowed.length} allowed, ${blocked.length} blocked, e2e ok`);
process.exit(failed ? 1 : 0);
