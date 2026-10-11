import picomatch from 'picomatch';
import type { SmartDiffRole } from '@devdigest/shared';
import { CLASSIFY_RULES } from './constants.js';

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
