import picomatch from 'picomatch';
import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Smart Diff file roles (spec `specs/2026-10-04-smart-diff.md`), shared by the
 * reviews Smart Diff and the PR Brief. Pure, no I/O.
 *
 * `CLASSIFY_RULES` is the MATCH order: the most specific roles go first, so
 * `__tests__/__snapshots__/x.snap` is boilerplate (not tests) and `e2e/README.md`
 * is tests (not docs). `core` has no rule — it is the fallback. The DISPLAY order
 * is `ROLE_ORDER` in `reviews/smart-diff/constants.ts`.
 */
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

/** One compiled matcher per rule, built once at import. */
const MATCHERS = CLASSIFY_RULES.map((rule) => ({
  role: rule.role,
  isMatch: picomatch([...rule.globs], { dot: true }),
}));

/**
 * Role of a changed file by its repo-relative path. Deterministic, no I/O:
 * the first rule in `CLASSIFY_RULES` that matches wins, else `'core'`.
 */
export function classifyFile(path: string): SmartDiffRole {
  for (const m of MATCHERS) {
    if (m.isMatch(path)) return m.role;
  }
  return 'core';
}
