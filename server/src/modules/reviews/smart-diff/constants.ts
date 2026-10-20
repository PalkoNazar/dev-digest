import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Smart Diff — file roles (spec `specs/2026-10-04-smart-diff.md`).
 *
 * Two orders on purpose:
 * - `ROLE_ORDER` is the DISPLAY order (what a reviewer reads first).
 * - `CLASSIFY_RULES` is the MATCH order — it lives with `classifyFile` in
 *   `modules/_shared/file-roles.ts` (shared with the PR Brief).
 */
export const ROLE_ORDER: readonly SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];
