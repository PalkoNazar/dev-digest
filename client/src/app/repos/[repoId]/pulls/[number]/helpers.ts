/* Route-wide pure helpers for the PR detail page: the Files changed jump target
   (`?tab=diff&file=…&line=…`) kept in the URL so a reload or a copied link reopens it. */
import type { DiffFocus } from "@/components/diff-viewer";

/** Search params as read from `useSearchParams()` (or a plain URLSearchParams). */
interface SearchLike {
  get(name: string): string | null;
  toString(): string;
}

/** Positive integer from a URL value, else null ("12abc", "0", "-3", "1.5" → null). */
function parseLine(raw: string | null): number | null {
  if (raw == null || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Href that opens Files changed on `path` (and `line`), keeping the other params (e.g. `trace`). */
export function diffFocusHref(
  basePath: string,
  search: SearchLike,
  path: string,
  line: number | null,
): string {
  const sp = new URLSearchParams(search.toString());
  sp.set("tab", "diff");
  sp.set("file", path);
  if (line != null && Number.isSafeInteger(line) && line > 0) sp.set("line", String(line));
  else sp.delete("line");
  return `${basePath}?${sp.toString()}`;
}

/** The focus target in the URL, or null when no `file` is set. A bad `line` is dropped. */
export function focusFromSearch(search: Pick<SearchLike, "get">): DiffFocus | null {
  const path = search.get("file");
  if (!path) return null;
  return { path, line: parseLine(search.get("line")) };
}
