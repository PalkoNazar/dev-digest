import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Smart Diff — file roles (spec `specs/2026-10-04-smart-diff.md`).
 *
 * Two orders on purpose:
 * - `ROLE_ORDER` is the DISPLAY order (what a reviewer reads first).
 * - `CLASSIFY_RULES` is the MATCH order: the most specific roles go first, so
 *   `__tests__/__snapshots__/x.snap` is boilerplate (not tests) and `e2e/README.md`
 *   is tests (not docs). `core` has no rule — it is the fallback.
 */
export const ROLE_ORDER: readonly SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

export interface ClassifyRule {
  role: Exclude<SmartDiffRole, 'core'>;
  /** picomatch globs on the repo-relative path (`dot: true`, so `.env*` and `.github/**` match). */
  globs: readonly string[];
}

// Globs as written in the spec. `**/x` also matches `x` at the repo root;
// `dist/**`, `e2e/**`, `docs/**`, `.github/**`, `.claude/**` are root prefixes.
export const CLASSIFY_RULES: readonly ClassifyRule[] = [
  {
    role: 'boilerplate',
    globs: [
      '**/*.lock',
      '**/pnpm-lock.yaml',
      '**/package-lock.json',
      'dist/**',
      'build/**',
      '**/__snapshots__/**',
      '**/*.snap',
      '**/*.generated.*',
      '**/*.min.js',
    ],
  },
  {
    role: 'tests',
    globs: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/test/**', '**/tests/**', '**/__tests__/**', 'e2e/**'],
  },
  {
    role: 'wiring',
    globs: [
      '**/index.ts',
      '**/index.js',
      '**/*.config.*',
      '**/tsconfig*.json',
      '**/.eslintrc*',
      '**/.env*',
      '**/docker-compose*.yml',
      '.github/**',
      '.claude/**',
    ],
  },
  {
    role: 'docs',
    globs: ['**/*.md', 'docs/**', '**/README*', '**/CHANGELOG*', '**/LICENSE'],
  },
];
