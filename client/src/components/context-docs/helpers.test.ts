import { describe, it, expect } from "vitest";
import type { ContextDocRow } from "@devdigest/shared";
import { detachPath, filterRows, movePath, ownPaths, togglePath } from "./helpers";

const row = (path: string, state: ContextDocRow["state"]): ContextDocRow => ({
  path,
  category: "x",
  tokens: 1,
  state,
  via: [],
});

describe("context-docs helpers", () => {
  it("filters by path case-insensitively and keeps all for an empty query", () => {
    const rows = [row("specs/API.md", "available"), row("docs/b.md", "available")];
    expect(filterRows(rows, "api").map((r) => r.path)).toEqual(["specs/API.md"]);
    expect(filterRows(rows, "  ")).toHaveLength(2);
  });

  it("own paths are the attached and missing rows in order, never inherited or available", () => {
    const rows = [row("a", "attached"), row("b", "missing"), row("c", "inherited"), row("d", "available")];
    expect(ownPaths(rows)).toEqual(["a", "b"]);
  });

  it("toggle appends a new path and removes an existing one", () => {
    expect(togglePath(["a"], "b")).toEqual(["a", "b"]);
    expect(togglePath(["a", "b"], "a")).toEqual(["b"]);
  });

  it("move swaps with the neighbour and is a no-op at the bounds", () => {
    expect(movePath(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(movePath(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(movePath(["a", "b"], "a", -1)).toEqual(["a", "b"]);
    expect(movePath(["a", "b"], "b", 1)).toEqual(["a", "b"]);
    expect(movePath(["a"], "zz", 1)).toEqual(["a"]);
  });

  it("detach removes the path", () => {
    expect(detachPath(["a", "gone", "b"], "gone")).toEqual(["a", "b"]);
  });
});
