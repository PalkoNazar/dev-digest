import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RipgrepCodeIndex } from '../src/adapters/codeindex/ripgrep.js';

/**
 * The pure-Node grep runs in a worker with a deadline, so a catastrophically
 * backtracking pattern can neither hang the search nor block the API's event loop.
 */
describe('RipgrepCodeIndex Node fallback', () => {
  let root: string;
  const repo = { owner: 'o', name: 'r' };
  const index = (timeoutMs = 10_000) =>
    new RipgrepCodeIndex({ clonePathFor: () => root }, { useRipgrep: false, nodeGrepTimeoutMs: timeoutMs });

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'grep-'));
    await mkdir(join(root, 'src'));
    await mkdir(join(root, 'node_modules'));
    await writeFile(join(root, 'src/a.ts'), "import x from 'y';\nthrow new NotFoundError('a');\n");
    await writeFile(join(root, 'node_modules/b.ts'), "throw new NotFoundError('b');\n");
    await writeFile(join(root, 'src/long.txt'), `${'a'.repeat(60)}b\n`);
    await writeFile(join(root, '.env'), "SECRET=NotFoundError('env')\n");
    await writeFile(join(root, 'src/.env.local.ts'), "throw new NotFoundError('env');\n");
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('finds matches with repo-relative paths; skips ignored dirs and env files', async () => {
    expect(await index().grep(repo, 'NotFoundError\\(')).toEqual([
      { path: 'src/a.ts', line: 2, text: "throw new NotFoundError('a');" },
    ]);
  });

  it('stops a catastrophic pattern at the deadline while the event loop keeps running', async () => {
    let ticks = 0;
    const timer = setInterval(() => ticks++, 10);
    const started = Date.now();
    await expect(index(300).grep(repo, '^(a|aa)+$')).rejects.toThrow(/timed out/);
    clearInterval(timer);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(ticks).toBeGreaterThan(5);
  });
});
