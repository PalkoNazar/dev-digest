import { describe, it, expect } from 'vitest';
import {
  capReadme,
  composeServices,
  detectPackageManager,
  deterministicRunSteps,
  findComposeFile,
  hasEnvExample,
  parseScripts,
  readingPath,
  readmePath,
  routesFromBlast,
  sourceCandidates,
  topLevelFolders,
} from '../src/modules/onboarding/helpers/facts.js';
import { makeFacts } from './helpers/onboarding-fixtures.js';

/**
 * SPEC-02 (L05 Onboarding Tour), plan S7 — deterministic facts, pure helpers.
 * AC-24, AC-25, AC-26, AC-27, AC-39, AC-45, AC-81, AC-85, EC-3, EC-5, EC-15, EC-23.
 */

const sorted = (xs: string[]) => [...xs].sort();

describe('sourceCandidates', () => {
  it('keeps indexable source files and skips excluded dirs and other languages', () => {
    const tree = [
      'src/a.ts',
      'src/b.tsx',
      'lib/c.mjs',
      'main.py',
      'node_modules/x/index.js',
      'dist/out.js',
      'README.md',
    ];
    expect(sorted(sourceCandidates(tree))).toEqual(['lib/c.mjs', 'src/a.ts', 'src/b.tsx']);
  });

  it('finds no candidates in a Python-only tree (EC-3, AC-39)', () => {
    expect(sourceCandidates(['main.py', 'pkg/mod.py', 'pyproject.toml', 'README.md'])).toEqual([]);
  });
});

describe('topLevelFolders', () => {
  it('counts indexed files per top-level folder and leaves node_modules out (AC-45)', () => {
    const tree = [
      'src/a.ts',
      'src/b.ts',
      'src/notes.md',
      'server/x.ts',
      'node_modules/p/index.js',
      'README.md',
    ];
    const indexed = new Set(['src/a.ts', 'src/b.ts', 'server/x.ts']);
    const folders = topLevelFolders(tree, indexed);
    expect(folders).toContainEqual({ path: 'src', files: 2 });
    expect(folders).toContainEqual({ path: 'server', files: 1 });
    expect(folders.map((f) => f.path)).not.toContain('node_modules');
    expect(folders.map((f) => f.path)).not.toContain('README.md');
  });
});

describe('package manager, compose, env', () => {
  it('maps the root lockfile to its package manager', () => {
    expect(detectPackageManager(['package.json', 'pnpm-lock.yaml'])).toBe('pnpm');
    expect(detectPackageManager(['package.json', 'package-lock.json'])).toBe('npm');
    expect(detectPackageManager(['package.json', 'yarn.lock'])).toBe('yarn');
    expect(detectPackageManager(['package.json', 'bun.lockb'])).toBe('bun');
  });

  it('falls back to npm with a root package.json and no lockfile (Q2), none without one', () => {
    expect(detectPackageManager(['package.json', 'src/a.ts'])).toBe('npm');
    expect(detectPackageManager(['main.py'])).toBeNull();
  });

  it('finds a root compose file', () => {
    expect(findComposeFile(['src/a.ts', 'compose.yaml'])).toBe('compose.yaml');
    expect(findComposeFile(['src/a.ts', 'docker-compose.yml'])).toBe('docker-compose.yml');
    expect(findComposeFile(['src/a.ts'])).toBeNull();
  });

  it('parses the service names of a compose file', () => {
    const text = [
      'version: "3.9"',
      'services:',
      '  postgres:',
      '    image: pgvector/pgvector:pg16',
      '    ports:',
      '      - "5432:5432"',
      '  redis:',
      '    image: redis:7',
      'volumes:',
      '  pgdata:',
    ].join('\n');
    expect(composeServices(text)).toEqual(['postgres', 'redis']);
  });

  it('reports .env.example by presence only; a committed .env yields no fact (EC-15)', () => {
    expect(hasEnvExample(['.env.example', 'src/a.ts'])).toBe(true);
    expect(hasEnvExample(['.env', 'src/a.ts'])).toBe(false);
  });
});

describe('parseScripts', () => {
  it('returns the scripts of a package.json', () => {
    expect(parseScripts('{"name":"x","scripts":{"dev":"tsx watch src/server.ts","build":"tsc"}}')).toEqual({
      dev: 'tsx watch src/server.ts',
      build: 'tsc',
    });
  });

  it('does not throw on a malformed package.json', () => {
    expect(() => parseScripts('{ "scripts": { "dev": ')).not.toThrow();
    expect(parseScripts('{ "scripts": { "dev": ')).toEqual({});
    expect(parseScripts('{"scripts":"oops"}')).toEqual({});
  });
});

describe('README', () => {
  it('picks the root README, none when the repo has no README (EC-23)', () => {
    expect(readmePath(['docs/README.md', 'README.md', 'src/a.ts'])).toBe('README.md');
    expect(readmePath(['src/a.ts', 'docs/README.md'])).toBeNull();
  });

  it('caps the README at 4,000 characters (AC-85)', () => {
    expect(capReadme('x'.repeat(10_000))).toHaveLength(4_000);
    expect(capReadme('short readme')).toBe('short readme');
  });

  it('never cuts an emoji in half at the 4,000 boundary (AC-85)', () => {
    const text = 'a'.repeat(3_999) + '😀' + 'b'.repeat(100); // emoji spans indices 3999–4000
    const out = capReadme(text);
    expect(out.length).toBeLessThanOrEqual(4_000);
    expect(out).toBe('a'.repeat(3_999));
    expect(/[\ud800-\udbff]$/.test(out)).toBe(false);
  });
});

describe('readingPath', () => {
  it('drops tests, configs, declarations, migrations, generated folders and non-files (AC-26)', () => {
    const pool = [
      'src/a.test.ts',
      'src/core.ts',
      'test/x.ts',
      'types.d.ts',
      'db/migrations/1.ts',
      'src/generated/x.ts',
      'vite.config.ts',
      'src/__tests__/y.ts',
      'src/b.spec.ts',
      'dist/out.js',
      'src/ghost.ts', // ranked but not a file at the commit
      'src/routes.ts',
    ];
    const fileSet = new Set(pool.filter((p) => p !== 'src/ghost.ts'));
    expect(readingPath(pool, fileSet)).toEqual(['src/core.ts', 'src/routes.ts']);
  });

  it('keeps rank order and returns at most 10 files (AC-25, AC-27)', () => {
    const pool = Array.from({ length: 15 }, (_, i) => `src/f${String(i).padStart(2, '0')}.ts`);
    const out = readingPath(pool, new Set(pool));
    expect(out).toEqual(pool.slice(0, 10));
  });

  it('still lists files in rank order with no import edges (EC-5)', () => {
    const pool = ['src/z.ts', 'src/a.ts', 'src/m.ts'];
    expect(readingPath(pool, new Set(pool))).toEqual(['src/z.ts', 'src/a.ts', 'src/m.ts']);
  });
});

describe('routesFromBlast', () => {
  const blast = {
    changedSymbols: [],
    impactedEndpoints: [],
    callers: [
      { file: 'src/b.ts', symbol: 'b', viaSymbol: 's', line: 1, rank: 3 },
      { file: 'src/a.ts', symbol: 'a', viaSymbol: 's', line: 1, rank: 9 },
      { file: 'src/c.ts', symbol: 'c', viaSymbol: 's', line: 1, rank: 5 },
      { file: 'src/b.ts', symbol: 'b2', viaSymbol: 's', line: 2, rank: 1 },
    ],
    factsByFile: {
      'src/b.ts': { endpoints: ['GET /b', 'GET /a'], crons: [] },
      'src/a.ts': { endpoints: ['GET /a', 'POST /a'], crons: ['0 3 * * *'] },
      'src/c.ts': { endpoints: ['GET /c'], crons: [] },
    },
  };

  it('orders endpoints by the highest caller rank of their file, deduped (AC-24)', () => {
    expect(routesFromBlast(blast, 50)).toEqual(['GET /a', 'POST /a', 'GET /c', 'GET /b']);
  });

  it('caps the list', () => {
    expect(routesFromBlast(blast, 2)).toEqual(['GET /a', 'POST /a']);
  });

  it('returns [] when the blast result has no facts (degraded index)', () => {
    expect(routesFromBlast({ ...blast, factsByFile: undefined, callers: [] }, 50)).toEqual([]);
  });
});

describe('deterministicRunSteps (AC-81)', () => {
  const commands = (f: Parameters<typeof deterministicRunSteps>[0]) =>
    deterministicRunSteps(f).map((s) => s.command);

  it('installs, copies .env.example, starts compose and runs dev', () => {
    const facts = makeFacts({
      packageManager: 'pnpm',
      hasEnvExample: true,
      composeFile: 'docker-compose.yml',
      scriptsByDir: { '.': { dev: 'tsx watch src/server.ts', start: 'node dist/server.js' } },
    });
    expect(commands(facts)).toEqual([
      'pnpm install',
      'cp .env.example .env',
      'docker compose up -d',
      'pnpm dev',
    ]);
  });

  it('runs start when there is no dev script', () => {
    const facts = makeFacts({
      packageManager: 'pnpm',
      hasEnvExample: false,
      composeFile: null,
      scriptsByDir: { '.': { start: 'node dist/server.js' } },
    });
    expect(commands(facts)).toEqual(['pnpm install', 'pnpm start']);
  });

  it('uses `npm run dev` for npm and `yarn dev` for yarn', () => {
    const base = { hasEnvExample: false, composeFile: null, scriptsByDir: { '.': { dev: 'vite' } } };
    expect(commands(makeFacts({ ...base, packageManager: 'npm' }))).toEqual(['npm install', 'npm run dev']);
    expect(commands(makeFacts({ ...base, packageManager: 'yarn' }))).toEqual(['yarn install', 'yarn dev']);
  });

  it('only installs when there are no scripts', () => {
    const facts = makeFacts({
      packageManager: 'pnpm',
      hasEnvExample: false,
      composeFile: null,
      scriptsByDir: { '.': {} },
    });
    expect(commands(facts)).toEqual(['pnpm install']);
  });

  it('never copies a committed .env when .env.example is missing (EC-15)', () => {
    const facts = makeFacts({ hasEnvExample: false, composeFile: null });
    expect(commands(facts).some((c) => c.startsWith('cp '))).toBe(false);
  });
});
