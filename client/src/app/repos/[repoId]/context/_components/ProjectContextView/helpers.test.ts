import { describe, it, expect } from "vitest";
import { groupByDir, splitPath } from "./helpers";

describe("splitPath", () => {
  it("splits a nested path into its directory (with the slash) and file name", () => {
    expect(splitPath(".claude/agents/implementer.md")).toEqual({ dir: ".claude/agents/", name: "implementer.md" });
  });
  it("gives a repo-root file an empty directory", () => {
    expect(splitPath("README.md")).toEqual({ dir: "", name: "README.md" });
  });
});

describe("groupByDir", () => {
  it("puts repo-root files first, then directories in path order, keeping the order inside a group", () => {
    const docs = [{ path: "specs/b.md" }, { path: ".claude/x.md" }, { path: "README.md" }, { path: "specs/a.md" }];
    expect(groupByDir(docs)).toEqual([
      { dir: "", docs: [{ path: "README.md" }] },
      { dir: ".claude/", docs: [{ path: ".claude/x.md" }] },
      { dir: "specs/", docs: [{ path: "specs/b.md" }, { path: "specs/a.md" }] },
    ]);
  });
  it("returns no groups for no documents", () => {
    expect(groupByDir([])).toEqual([]);
  });
});
