import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { countBySeverity, visibleFindings } from "./helpers";

const f = (id: string, severity: FindingRecord["severity"], confidence = 0.9) =>
  ({ id, severity, confidence }) as FindingRecord;

const FINDINGS = [f("s1", "SUGGESTION"), f("c1", "CRITICAL", 0.3), f("w1", "WARNING"), f("c2", "CRITICAL")];

describe("countBySeverity", () => {
  it("counts every level, zero when absent", () => {
    expect(countBySeverity(FINDINGS)).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
    expect(countBySeverity([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });
});

describe("visibleFindings", () => {
  it("sorts by severity with no filters", () => {
    expect(visibleFindings(FINDINGS, false).map((x) => x.id)).toEqual(["c1", "c2", "w1", "s1"]);
  });

  it("keeps only the chosen severity", () => {
    expect(visibleFindings(FINDINGS, false, "CRITICAL").map((x) => x.id)).toEqual(["c1", "c2"]);
  });

  it("combines the severity filter with hide-low-confidence", () => {
    expect(visibleFindings(FINDINGS, true, "CRITICAL").map((x) => x.id)).toEqual(["c2"]);
  });
});
