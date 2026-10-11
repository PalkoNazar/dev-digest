import { describe, it, expect } from "vitest";
import { resyncFinished } from "./repo-resync";

describe("resyncFinished", () => {
  it("is finished only when the index state moved past a known baseline", () => {
    expect(resyncFinished("t1", undefined)).toBe(false);
    expect(resyncFinished("t1", { updatedAt: "t1" })).toBe(false);
    expect(resyncFinished("t1", { updatedAt: "t2" })).toBe(true);
  });
});
