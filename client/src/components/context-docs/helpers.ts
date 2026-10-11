import type { ContextDocRow } from "@devdigest/shared";

/** Rows whose path contains the query, case-insensitively (AC-18). An empty query keeps all. */
export function filterRows(rows: ContextDocRow[], query: string): ContextDocRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.path.toLowerCase().includes(q));
}

/** The owner's own ordered path list (attached + missing rows, in row order) — what a save sends. */
export function ownPaths(rows: ContextDocRow[]): string[] {
  return rows.filter((r) => r.state === "attached" || r.state === "missing").map((r) => r.path);
}

/** Tick → append at the end; untick → remove. */
export function togglePath(paths: string[], path: string): string[] {
  return paths.includes(path) ? paths.filter((p) => p !== path) : [...paths, path];
}

/** Swap a path with its neighbour (-1 = up, 1 = down); unchanged at the bounds or when absent. */
export function movePath(paths: string[], path: string, dir: -1 | 1): string[] {
  const from = paths.indexOf(path);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= paths.length) return paths;
  const next = [...paths];
  next[from] = paths[to]!;
  next[to] = path;
  return next;
}

/** Remove a path (the Detach action of a missing document, AC-21). */
export function detachPath(paths: string[], path: string): string[] {
  return paths.filter((p) => p !== path);
}
