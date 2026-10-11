import { describe, it, expect } from "vitest";
import type { PrFile, SmartDiffGroup } from "@devdigest/shared";
import { groupFilesByRole } from "./helpers";

const file = (path: string): PrFile => ({ path, additions: 1, deletions: 0, patch: null });
const sf = (path: string) => ({ path, additions: 1, deletions: 0, finding_lines: [] });

describe("groupFilesByRole", () => {
  it("returns the PR files in group order and skips paths the PR doesn't have", () => {
    const groups: SmartDiffGroup[] = [
      { role: "core", files: [sf("src/b.ts"), sf("src/a.ts")] },
      { role: "boilerplate", files: [sf("pnpm-lock.yaml"), sf("gone.lock")] },
    ];
    const files = [file("pnpm-lock.yaml"), file("src/a.ts"), file("src/b.ts")];
    expect(groupFilesByRole(groups, files)).toEqual([
      { role: "core", files: [file("src/b.ts"), file("src/a.ts")] },
      { role: "boilerplate", files: [file("pnpm-lock.yaml")] },
    ]);
  });

  it("appends files no group mentions to core, creating core first when absent", () => {
    const groups: SmartDiffGroup[] = [{ role: "docs", files: [sf("README.md")] }];
    const files = [file("README.md"), file("src/new.ts")];
    expect(groupFilesByRole(groups, files).map((g) => [g.role, g.files.map((f) => f.path)])).toEqual([
      ["core", ["src/new.ts"]],
      ["docs", ["README.md"]],
    ]);
    const withCore: SmartDiffGroup[] = [{ role: "core", files: [sf("src/a.ts")] }];
    expect(groupFilesByRole(withCore, [file("src/a.ts"), file("src/new.ts")])[0]!.files.map((f) => f.path)).toEqual(
      ["src/a.ts", "src/new.ts"],
    );
  });
});
