import type { SmartDiffRole } from '@devdigest/shared';
import { CLASSIFY_RULES } from './constants.js';

/**
 * Role of a changed file by its repo-relative path. Deterministic, no I/O:
 * the first rule in `CLASSIFY_RULES` that matches wins, else `'core'`.
 */
export function classifyFile(path: string): SmartDiffRole {
  for (const rule of CLASSIFY_RULES) {
    if (rule.patterns.some((p) => p.test(path))) return rule.role;
  }
  return 'core';
}
