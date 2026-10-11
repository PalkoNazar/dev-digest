import type { TourFacts } from '../../src/modules/onboarding/types.js';

/**
 * SPEC-02 (L05 Onboarding Tour) — a small, fully grounded `TourFacts` for the pure
 * onboarding helper tests (S8 grounding/merge, S9 prompt). Override any field.
 *
 * Shape assumptions this fixture fixes (plan S6 `TourFacts`):
 * - `scriptsByDir` is keyed by the directory of the `package.json`; the root is `'.'`.
 * - `packageManager` is `'pnpm' | 'npm' | 'yarn' | 'bun' | null` (null = no root `package.json`).
 * - `readingPath` is the S7 output (rank order); `criticalPaths` are raw facade chains.
 * - `signatures` are rows in rank order (highest-ranked file first).
 * - `fileSet` holds every file path of the tree at the tour's commit.
 */
export const FILES = [
  'package.json',
  'pnpm-lock.yaml',
  '.env.example',
  'docker-compose.yml',
  'README.md',
  'src/a.ts',
  'src/b.ts',
  'src/c.ts',
  'src/server.ts',
  'src/db/client.ts',
  'scripts/x.ts',
  'server/package.json',
  'server/index.js',
] as const;

export function makeFacts(overrides: Partial<TourFacts> = {}): TourFacts {
  return {
    stack: ['TypeScript', 'Fastify', 'Docker Compose'],
    folders: [
      { path: 'src', files: 5 },
      { path: 'scripts', files: 1 },
    ],
    scriptsByDir: {
      '.': { dev: 'tsx watch src/server.ts', build: 'tsc', test: 'vitest' },
      server: { dev: 'node index.js', migrate: 'node migrate.js' },
    },
    packageManager: 'pnpm',
    composeFile: 'docker-compose.yml',
    composeServices: ['postgres'],
    hasEnvExample: true,
    readme: '# Demo\n\nA demo service.',
    routes: ['GET /health', 'POST /items'],
    repoMap: 'src/server.ts\n  function start()',
    signatures: [{ file: 'src/server.ts', name: 'start', kind: 'function', signature: 'function start(): void' }],
    readingPath: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
    criticalPaths: [['src/server.ts', 'src/a.ts', 'src/db/client.ts']],
    index: { status: 'full', reason: null, files_indexed: 7, files_total: 7 },
    commitSha: 'abc1234def5678',
    languagesIndexed: true,
    fileSet: new Set<string>(FILES),
    ...overrides,
  } as TourFacts;
}
