// Run: node .claude/hooks/spec-write-scope.test.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from './spec-write-scope.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'spec-scope-'));
const outside = mkdtempSync(path.join(tmpdir(), 'spec-outside-'));
for (const d of ['specs/plans', 'client/specs/designs/x', 'server/specs', 'e2e/specs', 'server/src']) {
  mkdirSync(path.join(root, d), { recursive: true });
}
writeFileSync(path.join(root, 'specs/2026-10-11-draft.md'), '# Spec: X | Spec ID: SPEC-01 | Status: draft\n');
writeFileSync(path.join(root, 'specs/L04-blast-radius.md'), '# Blast Radius\nStatus: done · Lesson: L04\n');
writeFileSync(path.join(root, 'specs/2026-10-11-approved.md'), '# Spec: Y | Spec ID: SPEC-02 | Status: approved\n');
symlinkSync(outside, path.join(root, 'specs/linked'));

const draft = '# Spec: Z | Spec ID: SPEC-03 | Status: draft\n## Проблема й навіщо\n';
const w = (file_path, content = draft) => ({ tool_name: 'Write', tool_input: { file_path, content } });
const e = (file_path, new_string = 'AC-2: WHEN … the system SHALL …') => ({
  tool_name: 'Edit',
  tool_input: { file_path, old_string: 'x', new_string },
});

const allowed = [
  w('specs/2026-10-11-new.md'),
  w(path.join(root, 'client/specs/2026-10-11-ui.md')),
  w('server/specs/L05-x.md'),
  w('mcp/specs/2026-10-11-tool.md'), // folder doesn't exist yet
  w('reviewer-core/specs/2026-10-11-core.md'),
  e('specs/2026-10-11-draft.md'),
];

const blocked = [
  w('server/src/x.ts'),
  w('specs/plans/2026-10-11-x.plan.md'),
  w('client/specs/designs/x/notes.md'),
  w('e2e/specs/08-x.md'),
  w('specs/README.md'),
  w('specs/x.txt'),
  w('../elsewhere/specs/x.md'),
  w('/etc/specs/x.md'),
  w('specs/linked/x.md'), // symlink out of the repo
  w('specs/../server/src/x.md'),
  e('specs/L04-blast-radius.md'), // old-format, done
  e('specs/2026-10-11-approved.md'),
  w('specs/2026-10-11-new.md', '# Spec: Z | Spec ID: SPEC-03 | Status: approved\n'),
  e('specs/2026-10-11-draft.md', '# Spec: X | Spec ID: SPEC-01 | Status: implemented'),
  { tool_name: 'Write', tool_input: {} },
];

let failed = 0;
for (const c of allowed) {
  const r = check(c, root);
  if (r) { failed++; console.error(`FAIL allowed but blocked (${r}): ${c.tool_input.file_path}`); }
}
for (const c of blocked) {
  if (!check(c, root)) { failed++; console.error(`FAIL blocked but allowed: ${c.tool_input.file_path}`); }
}

// End-to-end through stdin, as Claude Code calls it.
const script = fileURLToPath(new URL('./spec-write-scope.mjs', import.meta.url));
const run = (input) =>
  spawnSync(process.execPath, [script], {
    input: JSON.stringify(input),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
if (run(w('server/src/x.ts')).status !== 2) { failed++; console.error('FAIL e2e: write outside specs not blocked with exit 2'); }
if (run(w('specs/2026-10-11-new.md')).status !== 0) { failed++; console.error('FAIL e2e: spec write blocked'); }

rmSync(root, { recursive: true, force: true });
rmSync(outside, { recursive: true, force: true });
console.log(failed ? `${failed} failed` : `ok: ${allowed.length} allowed, ${blocked.length} blocked, e2e ok`);
process.exit(failed ? 1 : 0);
