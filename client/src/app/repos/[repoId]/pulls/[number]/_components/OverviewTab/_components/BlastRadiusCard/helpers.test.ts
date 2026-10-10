import { describe, it, expect } from "vitest";
import { linkSha, resyncFinished, symbolLabel } from "./helpers";

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
    expect(resyncFinished(null, { updatedAt: "t1" })).toBe(false);
  });
});
