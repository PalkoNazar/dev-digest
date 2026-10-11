/**
 * L05 Project Context constants. Spec: specs/L05-project-context.md
 */

/**
 * Folders whose Markdown files are never listed (AC-1), at any depth. A copy of
 * `repo-intel/constants.ts` `EXCLUDED_DIRS` — modules don't import each other.
 */
export const EXCLUDED_DIRS = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'vendor',
  '.git',
] as const;

/** Per-document injection limit in characters (AC-36). */
export const MAX_DOC_CHARS = 20_000;
/** Total injection budget in document characters, marker excluded (AC-37, Q2). */
export const MAX_TOTAL_CHARS = 60_000;

/** Documents are listed and read from the default branch as of the last sync (AC-34). */
export const DOC_REF = 'HEAD';

/** Git tree modes of a regular (or executable) file and of a symlink. */
export const BLOB_MODES = ['100644', '100755'] as const;
export const SYMLINK_MODE = '120000';

/** Visible marker appended to a document cut at `MAX_DOC_CHARS` (AC-36). */
export function truncationMarker(total: number): string {
  return `\n\n[… truncated by DevDigest: first ${MAX_DOC_CHARS.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} characters]`;
}
