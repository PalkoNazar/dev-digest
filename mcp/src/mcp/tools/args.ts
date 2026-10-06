/*
 * Tool input schemas import 'zod/v3', not 'zod'. Same runtime module (zod 3.25's root re-exports
 * v3), but the SDK types `inputSchema` against `zod/v3`'s declarations while the tsconfig `paths`
 * entry for 'zod' (needed by the shared source) resolves to the CJS `.d.cts` ones, and the two
 * class declarations are not assignable to each other (TS2322 / TS2589).
 */
import { z } from 'zod/v3';

/** Input fields shared by several tools (texts from the plan's "Tool texts" table). */

export const repoArg = z.string().min(1).describe('GitHub repo as "owner/name"');

export const prArg = z.number().int().positive().describe('Pull request number');
