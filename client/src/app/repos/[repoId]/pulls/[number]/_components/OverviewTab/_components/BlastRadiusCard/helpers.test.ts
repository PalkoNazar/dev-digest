import { describe, it, expect } from "vitest";
import { duplicateSymbols, linkSha, resyncFinished, symbolLabel } from "./helpers";

describe("linkSha", () => {
  it("prefers the index SHA and falls back to the PR head", () => {
    expect(linkSha({ index_sha: "idx" }, "head")).toBe("idx");
    expect(linkSha({ index_sha: null }, "head")).toBe("head");
    expect(linkSha({}, null)).toBeNull();
  });
});

describe("symbolLabel", () => {
  it("adds () only for functions and methods", () => {
    const changed = [
      { name: "build", file: "a.ts", kind: "function" },
      { name: "Repo", file: "b.ts", kind: "class" },
    ];
    expect(symbolLabel("build", changed)).toBe("build()");
    expect(symbolLabel("Repo", changed)).toBe("Repo");
    expect(symbolLabel("unknown", changed)).toBe("unknown");
  });
});

describe("resyncFinished", () => {
  it("is finished only when the index state moved past a known baseline", () => {
    expect(resyncFinished("t1", undefined)).toBe(false);
    expect(resyncFinished("t1", { updatedAt: "t1" })).toBe(false);
    expect(resyncFinished("t1", { updatedAt: "t2" })).toBe(true);
  });
});

describe("duplicateSymbols / symbolLabel with a file", () => {
  it("finds names declared in several files and labels each by its own declaration", () => {
    const d = (symbol: string, file: string) => ({
      symbol,
      file,
      callers: [],
      endpoints_affected: [],
      crons_affected: [],
    });
    expect([...duplicateSymbols([d("handler", "a.ts"), d("handler", "b.ts"), d("x", "c.ts")])]).toEqual([
      "handler",
    ]);
    const changed = [
      { name: "handler", file: "a.ts", kind: "function" },
      { name: "handler", file: "b.ts", kind: "const" },
    ];
    expect(symbolLabel("handler", changed, "a.ts")).toBe("handler()");
    expect(symbolLabel("handler", changed, "b.ts")).toBe("handler");
  });
});
