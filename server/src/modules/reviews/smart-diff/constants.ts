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
  patterns: readonly RegExp[];
}

// Patterns run on a repo-relative path. `(?:^|\/)` = "at the start or after a
// slash" (`**/`); `[^/]*` stays inside the last segment (basename checks).
// Anchored, no nested quantifiers (ReDoS-safe).
export const CLASSIFY_RULES: readonly ClassifyRule[] = [
  {
    role: 'boilerplate',
    patterns: [
      /(?:^|\/)[^/]*\.lock$/, // *.lock (yarn.lock, Cargo.lock, …)
      /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json)$/,
      /^(?:dist|build)\//, // root dist/**, build/**
      /(?:^|\/)__snapshots__\//,
      /\.snap$/,
      /(?:^|\/)[^/]*\.generated\.[^/]+$/,
      /\.min\.js$/,
    ],
  },
  {
    role: 'tests',
    patterns: [
      /\.test\.tsx?$/, // *.test.ts(x), *.it.test.ts
      /\.spec\.ts$/,
      /(?:^|\/)(?:test|tests|__tests__)\//,
      /^e2e\//,
    ],
  },
  {
    role: 'wiring',
    patterns: [
      /(?:^|\/)index\.(?:ts|js)$/,
      /(?:^|\/)[^/]*\.config\.[^/]+$/,
      /(?:^|\/)tsconfig[^/]*\.json$/,
      /(?:^|\/)\.eslintrc[^/]*$/,
      /(?:^|\/)\.env[^/]*$/,
      /(?:^|\/)docker-compose[^/]*\.yml$/,
      /^\.(?:github|claude)\//,
    ],
  },
  {
    role: 'docs',
    patterns: [
      /\.md$/,
      /^docs\//,
      /(?:^|\/)(?:README|CHANGELOG)[^/]*$/,
      /(?:^|\/)LICENSE$/,
    ],
  },
];
