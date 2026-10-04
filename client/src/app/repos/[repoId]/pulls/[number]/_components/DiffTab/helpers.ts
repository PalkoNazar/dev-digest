/** Pure helpers for the Files changed tab. */
import type { PrFile, SmartDiffGroup, SmartDiffRole } from "@devdigest/shared";

export interface RoleFiles {
  role: SmartDiffRole;
  files: PrFile[];
}

/**
 * Map the server's Smart Diff groups onto the PR's files (by path), in group
 * order. Paths the PR doesn't have are skipped; PR files no group mentions
 * (smart-diff older than the file list) are appended to `core` — created
 * first if absent — so no file is ever hidden.
 */
export function groupFilesByRole(groups: readonly SmartDiffGroup[], files: readonly PrFile[]): RoleFiles[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const placed = new Set<string>();
  const out: RoleFiles[] = groups.map((g) => ({
    role: g.role,
    files: g.files.flatMap((sf) => {
      const file = byPath.get(sf.path);
      if (!file || placed.has(sf.path)) return [];
      placed.add(sf.path);
      return [file];
    }),
  }));
  const orphans = files.filter((f) => !placed.has(f.path));
  if (orphans.length > 0) {
    const core = out.find((g) => g.role === "core");
    if (core) core.files.push(...orphans);
    else out.unshift({ role: "core", files: [...orphans] });
  }
  return out.filter((g) => g.files.length > 0);
}
