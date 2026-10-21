/** Focus target for the diff: a file (and optionally a new-side line) to open,
    highlight and scroll to — set by a PR Brief jump (`?tab=diff&file=…&line=…`). */
import type { Line } from "./helpers";

export interface DiffFocus {
  path: string;
  /** New-side line number; `null` = the file only. */
  line: number | null;
}

/** Index of the rendered row showing new-side `line`, or -1 (no line / not in the patch). */
export function focusLineIndex(lines: Line[], line: number | null): number {
  if (line == null) return -1;
  return lines.findIndex((ln) => (ln.kind === "add" || ln.kind === "ctx") && ln.newNo === line);
}

/** Stable identity of a focus target — effects key on it. */
export function focusKeyOf(focus: DiffFocus | null | undefined): string | null {
  return focus ? `${focus.path}:${focus.line ?? ""}` : null;
}
