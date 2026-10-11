import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { findingKey, partitionFindings, topSeverity } from "./findings";

const f = (
  id: string,
  start_line: number,
  severity: FindingRecord["severity"] = "WARNING",
  dismissed = false,
) =>
  ({
    id,
    file: "a.ts",
    start_line,
    severity,
    dismissed_at: dismissed ? "2026-10-01T00:00:00Z" : null,
  }) as FindingRecord;

describe("partitionFindings", () => {
  it("keys findings on the RIGHT side; lines not rendered (or LEFT-only) are unmatched", () => {
    const rendered = new Set(["RIGHT:11", "RIGHT:12", "LEFT:20"]);
    const { matched, unmatched } = partitionFindings(
      [f("a", 11), f("b", 11), f("c", 20), f("d", 999)],
      rendered,
    );
    expect(findingKey(f("x", 11))).toBe("RIGHT:11");
    expect(matched.get("RIGHT:11")?.map((x) => x.id)).toEqual(["a", "b"]);
    expect(unmatched.map((x) => x.id)).toEqual(["c", "d"]);
  });
});

describe("topSeverity", () => {
  it("picks the most severe non-dismissed finding", () => {
    expect(topSeverity([f("a", 1, "SUGGESTION"), f("b", 1, "CRITICAL", true), f("c", 1, "WARNING")])).toBe(
      "WARNING",
    );
  });

  it("falls back to the most severe of all when every finding is dismissed; null when empty", () => {
    expect(topSeverity([f("a", 1, "SUGGESTION", true), f("b", 1, "CRITICAL", true)])).toBe("CRITICAL");
    expect(topSeverity([])).toBeNull();
  });
});
