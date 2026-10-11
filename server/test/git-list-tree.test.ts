/**
 * L05 S4 — SimpleGitClient.listTree over a real git repo in a tmpdir.
 * Lists committed blobs with their modes (symlinks = 120000) and never follows
 * a symlink on disk: `showFile` on an outside-pointing link returns the link text.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';

const repo = { owner: 'acme', name: 'docs' };
let cloneDir: string;
let client: SimpleGitClient;

beforeAll(async () => {
  cloneDir = await mkdtemp(join(tmpdir(), 'git-list-tree-'));
  const dir = join(cloneDir, repo.owner, repo.name);
  await mkdir(join(dir, 'docs'), { recursive: true });
  await mkdir(join(dir, 'node_modules', 'x'), { recursive: true });
  await writeFile(join(dir, 'README.md'), '# Readme\n');
  await writeFile(join(dir, 'docs', 'a.md'), 'A\n');
  await writeFile(join(dir, 'node_modules', 'x', 'y.md'), 'Y\n');
  await symlink('README.md', join(dir, 'CLAUDE.md'));
  await symlink('/etc/hosts', join(dir, 'out.md'));
  const git = simpleGit(dir);
  await git.init();
  await git.add('.');
  await git.raw(['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'init']);
  client = new SimpleGitClient(cloneDir);
});

afterAll(async () => {
  await rm(cloneDir, { recursive: true, force: true });
});

describe('SimpleGitClient.listTree', () => {
  it('returns every committed blob with its mode and size; symlinks have mode 120000', async () => {
    const entries = await client.listTree(repo, 'HEAD');
    const sorted = [...(entries ?? [])].sort((a, b) => a.path.localeCompare(b.path));
    expect(sorted).toEqual([
      { path: 'CLAUDE.md', mode: '120000', size: 9 },
      { path: 'docs/a.md', mode: '100644', size: 2 },
      { path: 'node_modules/x/y.md', mode: '100644', size: 2 },
      { path: 'out.md', mode: '120000', size: 10 },
      { path: 'README.md', mode: '100644', size: 9 },
    ]);
  });

  it('showFile on a symlink pointing outside the repo returns the link text, not the target', async () => {
    expect(await client.showFile(repo, 'HEAD', 'out.md')).toBe('/etc/hosts');
  });

  it('returns null when the repo has no clone', async () => {
    expect(await client.listTree({ owner: 'acme', name: 'missing' }, 'HEAD')).toBeNull();
  });
});
