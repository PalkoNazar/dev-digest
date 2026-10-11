/** The index state's `updatedAt` as the "last sync" time; null when the repo was never indexed (epoch 0). */
export function lastSyncDate(updatedAt: string | null | undefined): Date | null {
  if (!updatedAt) return null;
  const d = new Date(updatedAt);
  return Number.isNaN(d.getTime()) || d.getTime() <= 0 ? null : d;
}

/** `a/b/c.md` → `{ dir: "a/b/", name: "c.md" }`; a repo-root file has `dir: ""`. */
export function splitPath(path: string): { dir: string; name: string } {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? { dir: "", name: path } : { dir: path.slice(0, cut + 1), name: path.slice(cut + 1) };
}

/** Documents grouped by their directory: repo-root files (`dir: ""`) first, then the
 *  directories in path order; inside a group the incoming order is kept. */
export function groupByDir<T extends { path: string }>(docs: readonly T[]): { dir: string; docs: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const d of docs) {
    const { dir } = splitPath(d.path);
    const group = groups.get(dir);
    if (group) group.push(d);
    else groups.set(dir, [d]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a < b ? -1 : a > b ? 1 : 0))
    .map(([dir, items]) => ({ dir, docs: items }));
}
