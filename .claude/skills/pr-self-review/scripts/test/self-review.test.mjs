// Run: node --test .claude/skills/pr-self-review/scripts/test/self-review.test.mjs
// Each test builds a throwaway git repo, so nothing touches the real clone's state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { globToRegExp, loadRouting, packageOf, parseUnifiedDiff, readWorkingFile, route } from '../lib.mjs';

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeRepo(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'psr-'));
  const home = path.join(dir, '.home');
  mkdirSync(home);
  const env = { ...process.env, HOME: home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  for (const k of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'GITHUB_TOKEN', 'GH_TOKEN', 'SKIP_SELF_REVIEW']) delete env[k];
  const repo = path.join(dir, 'repo');
  mkdirSync(repo);
  const g = (...args) => execFileSync('git', args, { cwd: repo, env, encoding: 'utf8' }).trim();
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@example.com');
  g('config', 'user.name', 't');
  write(repo, { '.claude/skills/security/SKILL.md': 'x', '.claude/skills/zod/SKILL.md': 'x', ...files });
  g('add', '-A');
  g('commit', '-qm', 'base');
  return { repo, home, env, g };
}

function write(repo, files) {
  for (const [p, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(repo, p)), { recursive: true });
    writeFileSync(path.join(repo, p), content);
  }
}

function run(ctx, script, args = [], input) {
  const res = spawnSync('node', [path.join(SCRIPTS, script), ...args], { cwd: ctx.repo, env: ctx.env, encoding: 'utf8', input });
  return { code: res.status, out: res.stdout, err: res.stderr };
}

/** collect → hard-checks → finalize; returns the parsed artifacts. */
function pipeline(ctx, llm, hardArgs = []) {
  const c = run(ctx, 'collect-diff.mjs');
  assert.equal(c.code, 0, c.err);
  const runDir = /RUN_DIR=(.+)/.exec(c.out)[1];
  const h = run(ctx, 'hard-checks.mjs', ['--run', runDir, ...hardArgs]);
  assert.equal(h.code, 0, h.err);
  const llmFile = path.join(runDir, 'llm-input.json');
  writeFileSync(llmFile, JSON.stringify(llm ?? { reviewedFiles: [], findings: [] }));
  const f = run(ctx, 'finalize.mjs', ['--run', runDir, '--llm', llmFile]);
  assert.equal(f.code, 0, f.err);
  const read = (n) => JSON.parse(readFileSync(path.join(runDir, n), 'utf8'));
  return { runDir, collect: read('collect.json'), hard: read('hard.json'), report: f.out };
}

const verdictOf = (ctx, sha) => {
  const file = path.join(ctx.repo, '.git', 'devdigest-self-review', 'verdicts', `${sha}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
};

const prePush = (ctx, sha, extraEnv = {}) =>
  spawnSync('node', [path.join(SCRIPTS, 'check-verdict.mjs')], {
    cwd: ctx.repo, env: { ...ctx.env, ...extraEnv }, encoding: 'utf8',
    input: `refs/heads/feat ${sha} refs/heads/feat ${'0'.repeat(40)}\n`,
  });

test('globs: ** spans zero or more dirs, {a,b} alternates', () => {
  assert.ok(globToRegExp('**/*.ts').test('a.ts'));
  assert.ok(globToRegExp('**/*.ts').test('x/y/a.ts'));
  assert.ok(!globToRegExp('client/src/*.ts').test('client/src/a/b.ts'));
  assert.ok(globToRegExp('server/src/**/routes*.ts').test('server/src/modules/pulls/routes.ts'));
  assert.ok(globToRegExp('a.{ts,tsx}').test('a.tsx'));
});

test('routing: client file → ui skills; zod only when content matches', () => {
  const routing = loadRouting();
  const ui = route('client/src/app/pulls/page.tsx', 'export default function P() {}', routing);
  assert.deepEqual(ui.groups, ['shared', 'ui']);
  assert.ok(ui.skills.includes('frontend-ui-architecture'));
  assert.ok(ui.skills.includes('next-best-practices'));
  assert.ok(!ui.skills.includes('zod'));
  assert.ok(route('server/src/x.ts', 'const S = z.object({})', routing).skills.includes('zod'));
  assert.ok(route('server/src/modules/a/service.ts', '', routing).skills.includes('onion-architecture'));
  assert.deepEqual(route('README.md', '', routing).skills, []);
});

test('mcp: own package; src routed to typescript-expert + zod, not onion-architecture', () => {
  assert.equal(packageOf('mcp/src/x.ts'), 'mcp');
  assert.equal(packageOf('mcpx/a.ts'), 'root');
  const mcp = route('mcp/src/core/format.ts', '', loadRouting());
  assert.ok(mcp.skills.includes('typescript-expert'));
  assert.ok(mcp.skills.includes('zod'));
  assert.ok(!mcp.skills.includes('onion-architecture'));
});

test('diff parser: new-side line numbers of added lines, header-like content lines', () => {
  const files = parseUnifiedDiff([
    'diff --git a/f.ts b/f.ts', 'index 1..2 100644', '--- a/f.ts', '+++ b/f.ts',
    '@@ -2,0 +3,2 @@', '+one', '+++two', '@@ -9 +11 @@', '-old', '+new',
  ].join('\n'));
  assert.deepEqual(files[0].added, [{ line: 3, text: 'one' }, { line: 4, text: '++two' }, { line: 11, text: 'new' }]);
  assert.deepEqual(files[0].removed, ['old']);
});

test('hard checks: migration edit, one-sided contract, prompt copies, secrets', () => {
  const contract = "export const A = 1;\n";
  const ctx = makeRepo({
    'server/src/vendor/shared/contracts/a.ts': contract,
    'client/src/vendor/shared/contracts/a.ts': contract,
    'server/src/db/migrations/0001_init.sql': 'create table t();\n',
    'docs/agent-prompts/general-reviewer.md': '# Role\n',
    'server/src/db/seed-prompts.ts': 'export const P = 1;\n',
  });
  const fakeKey = 'sk-' + 'Q'.repeat(32);
  const knownValue = 'known-secret-value-' + 'z'.repeat(12);
  mkdirSync(path.join(ctx.home, '.devdigest'));
  writeFileSync(path.join(ctx.home, '.devdigest', 'secrets.json'), JSON.stringify({ github: { token: knownValue } }));
  ctx.g('switch', '-qc', 'feat/x');
  write(ctx.repo, {
    'server/src/vendor/shared/contracts/a.ts': 'export const A = 2;\n',
    'server/src/db/migrations/0001_init.sql': 'create table t(id int);\n',
    'docs/agent-prompts/general-reviewer.md': '# Role\nnew\n',
    'lib/config.ts': `const k = '${fakeKey}';\nconst t = '${knownValue}';\n`,
  });
  ctx.g('add', '-A');
  ctx.g('commit', '-qm', 'feat(x): change');

  const { hard, report } = pipeline(ctx, null, ['--no-commands']);
  const rules = hard.findings.map((f) => `${f.severity}:${f.rule}:${f.file}`).sort();
  assert.deepEqual(rules, [
    'critical:broken-contract:server/src/vendor/shared/contracts/a.ts',
    'critical:do-not-touch:server/src/db/migrations/0001_init.sql',
    'critical:secret-leak:lib/config.ts',
    'critical:secret-leak:lib/config.ts',
    'major:prompt-copies:docs/agent-prompts/general-reviewer.md',
  ]);
  assert.ok(hard.incomplete, '--no-commands marks the checks incomplete');
  assert.match(report, /Verdict: BLOCK/, 'a critical wins over an incomplete run');
  assert.ok(!report.includes(fakeKey) && !report.includes(knownValue), 'report must never echo a secret');
  assert.match(report, /secrets\.json\.github\.token/);
});

test('verdict: grounding, ignore comment, cache, pre-push gate, bypass, dirty re-run', () => {
  const ctx = makeRepo({ 'lib/a.ts': 'export const a = 1;\n' });
  ctx.g('switch', '-qc', 'feat/y');
  write(ctx.repo, { 'lib/a.ts': 'export const a = 1;\nexport const q = `SELECT * FROM t WHERE id = ${id}`;\n' });
  ctx.g('add', '-A');
  ctx.g('commit', '-qm', 'feat(lib): query');
  const sha1 = ctx.g('rev-parse', 'HEAD');

  const finding = { group: 'shared', skill: 'security', severity: 'critical', file: 'lib/a.ts', line: 2, rule: 'security-vuln', evidence: 'WHERE id = ${id}', message: 'SQL injection', fix: 'parametrize' };
  const first = pipeline(ctx, {
    reviewedFiles: ['lib/a.ts'],
    findings: [
      finding,
      { ...finding, line: 1, message: 'unchanged line' },
      { ...finding, evidence: 'not in the file at all', message: 'invented evidence' },
      { ...finding, rule: 'build-broken', message: 'reserved rule' },
    ],
  });
  assert.match(first.report, /Verdict: BLOCK/);
  assert.equal(verdictOf(ctx, sha1).counts.critical, 1);
  assert.equal(JSON.parse(readFileSync(path.join(first.runDir, 'dropped.json'), 'utf8')).length, 3);
  assert.equal(prePush(ctx, sha1).status, 1);

  // Same bytes → cached; finalize without reviewer input reuses the cached finding.
  const cached = pipeline(ctx, null);
  assert.ok(cached.collect.files.find((f) => f.path === 'lib/a.ts').cached);
  assert.match(cached.report, /Verdict: BLOCK/);
  assert.match(cached.report, /security, cached/);

  // Justified ignore on the line above → suppressed → PASS for the new commit.
  write(ctx.repo, { 'lib/a.ts': 'export const a = 1;\n// self-review-ignore: security-vuln — id is a numeric literal from the router\nexport const q = `SELECT * FROM t WHERE id = ${id}`;\n' });
  ctx.g('commit', '-qam', 'fix(lib): justify');
  const sha2 = ctx.g('rev-parse', 'HEAD');
  const second = pipeline(ctx, { reviewedFiles: ['lib/a.ts'], findings: [{ ...finding, line: 3 }] });
  assert.match(second.report, /Verdict: PASS/);
  assert.match(second.report, /reason: id is a numeric literal/);
  assert.equal(prePush(ctx, sha2).status, 0);

  // A dirty re-run must not replace the clean PASS of sha2.
  write(ctx.repo, { 'lib/b.ts': 'export const b = 1;\n' });
  const dirty = pipeline(ctx, null);
  assert.match(dirty.report, /push blocked/);
  assert.equal(verdictOf(ctx, sha2).verdict, 'PASS');
  assert.equal(prePush(ctx, sha2).status, 0);

  // No verdict for a new commit → blocked; bypass → allowed and logged.
  ctx.g('add', '-A');
  ctx.g('commit', '-qm', 'feat(lib): b');
  const sha3 = ctx.g('rev-parse', 'HEAD');
  const blocked = prePush(ctx, sha3);
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /no self-review for this commit/);
  const bypass = prePush(ctx, sha3, { SKIP_SELF_REVIEW: '1', SKIP_SELF_REVIEW_REASON: 'hotfix' });
  assert.equal(bypass.status, 0);
  const log = readFileSync(path.join(ctx.repo, '.git', 'devdigest-self-review', 'bypass.log'), 'utf8');
  assert.match(log, new RegExp(`${sha3}.*hotfix`));
});

test('subagent batches: a batch without a result makes the verdict INCOMPLETE and skips the cache', () => {
  const ctx = makeRepo({ 'lib/a.ts': 'export const a = 1;\n' });
  ctx.g('switch', '-qc', 'feat/z');
  write(ctx.repo, { 'lib/a.ts': 'export const a = 2;\n' });
  ctx.g('commit', '-qam', 'feat(lib): a');
  const c = run(ctx, 'collect-diff.mjs');
  const runDir = /RUN_DIR=(.+)/.exec(c.out)[1];
  run(ctx, 'hard-checks.mjs', ['--run', runDir]);
  const plan = JSON.parse(run(ctx, 'review-plan.mjs', ['--run', runDir]).out);
  assert.deepEqual(plan.batches.map((b) => b.id), ['shared-1']);
  assert.deepEqual(plan.batches[0].skills, ['security']);

  const missing = run(ctx, 'finalize.mjs', ['--run', runDir]);
  assert.match(missing.out, /Verdict: INCOMPLETE/);
  assert.match(missing.out, /without a valid result: shared-1/);

  writeFileSync(path.join(runDir, 'review-shared-1.json'), JSON.stringify({ findings: [] }));
  assert.match(run(ctx, 'finalize.mjs', ['--run', runDir]).out, /Verdict: PASS/);
  const again = run(ctx, 'collect-diff.mjs');
  assert.match(again.out, /\| `lib\/a.ts` \| security \| shared \| yes \|/);
});

test('symlinks: never followed — outside content stays out of collect.json and review', () => {
  const ctx = makeRepo({ 'lib/a.ts': 'export const a = 1;\n' });
  const outside = path.join(ctx.home, 'outside');
  mkdirSync(outside);
  const marker = 'OUTSIDE-CONTENT-' + 'x'.repeat(20);
  writeFileSync(path.join(outside, 'private.ts'), `export const s = '${marker}';\n`);
  ctx.g('switch', '-qc', 'feat/links');
  symlinkSync(path.join(outside, 'private.ts'), path.join(ctx.repo, 'lib/tracked-link.ts'));
  ctx.g('add', '-A');
  ctx.g('commit', '-qm', 'feat(lib): link');
  symlinkSync(path.join(outside, 'private.ts'), path.join(ctx.repo, 'lib/untracked-link.ts'));
  symlinkSync(outside, path.join(ctx.repo, 'linkdir'));

  const { runDir, collect } = pipeline(ctx, null);
  const raw = readFileSync(path.join(runDir, 'collect.json'), 'utf8');
  assert.ok(!raw.includes(marker), 'content behind a symlink must never be read');
  for (const p of ['lib/tracked-link.ts', 'lib/untracked-link.ts']) {
    const f = collect.files.find((x) => x.path === p);
    assert.ok(f, `${p} is listed`);
    assert.ok(f.symlink && f.excluded, `${p} is a symlink excluded from review`);
    assert.deepEqual(f.skills, []);
  }
  const plan = JSON.parse(run(ctx, 'review-plan.mjs', ['--run', runDir]).out);
  assert.ok(!JSON.stringify(plan).includes('link'), 'no reviewer batch gets a symlink');
  assert.equal(readWorkingFile(ctx.repo, 'linkdir/private.ts'), null, 'a symlinked parent dir is refused');
  assert.equal(readWorkingFile(ctx.repo, 'lib/a.ts').kind, 'file');
});

test('branch hygiene: a commit in another area and scope is flagged as another feature', () => {
  const ctx = makeRepo({ 'client/a.md': 'a\n', 'server/b.md': 'b\n' });
  ctx.g('switch', '-qc', 'feat/ui-thing');
  write(ctx.repo, { 'client/a.md': 'a2\n' });
  ctx.g('commit', '-qam', 'feat(client): ui thing');
  write(ctx.repo, { 'client/a.md': 'a3\n' });
  ctx.g('commit', '-qam', 'fix(client): polish');
  write(ctx.repo, { 'server/b.md': 'b2\n' });
  ctx.g('commit', '-qam', 'fix(server): unrelated');
  const { hard } = pipeline(ctx, null);
  const mix = hard.warnings.filter((w) => w.rule === 'feature-mix');
  assert.equal(mix.length, 1);
  assert.match(mix[0].message, /unrelated/);
  assert.doesNotMatch(mix[0].message, /polish/);
});
