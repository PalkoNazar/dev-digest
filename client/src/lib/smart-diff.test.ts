import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import {
  countsAsFinding,
  filesWithFindings,
  findingsByFile,
  latestReviewsPerAgent,
} from "./smart-diff";

const finding = (id: string, file: string, dismissed = false) =>
  ({ id, file, start_line: 1, dismissed_at: dismissed ? "2026-10-01T00:00:00Z" : null }) as FindingRecord;

const review = (
  id: string,
  agent_id: string | null,
  created_at: string,
  findings: FindingRecord[] = [],
  kind: ReviewRecord["kind"] = "review",
) => ({ id, agent_id, created_at, kind, findings }) as ReviewRecord;

describe("latestReviewsPerAgent", () => {
  it("keeps the newest review per agent, newest first, ignoring summaries", () => {
    const reviews = [
      review("a-old", "A", "2026-10-01T10:00:00Z"),
      review("b", "B", "2026-10-01T11:00:00Z"),
      review("sum", "A", "2026-10-03T10:00:00Z", [], "summary"),
      review("a-new", "A", "2026-10-02T10:00:00Z"),
    ];
    expect(latestReviewsPerAgent(reviews).map((r) => r.id)).toEqual(["a-new", "b"]);
  });

  it("treats a null agent as its own bucket, whatever the input order", () => {
    const reviews = [
      review("n-old", null, "2026-10-01T10:00:00Z"),
      review("a", "A", "2026-10-01T09:00:00Z"),
      review("n-new", null, "2026-10-02T10:00:00Z"),
    ];
    expect(latestReviewsPerAgent(reviews).map((r) => r.id)).toEqual(["n-new", "a"]);
    expect(latestReviewsPerAgent([...reviews].reverse()).map((r) => r.id)).toEqual(["n-new", "a"]);
  });
});

describe("findingsByFile + filesWithFindings", () => {
  it("groups findings by path and counts only files with a non-dismissed finding", () => {
    const byFile = findingsByFile([
      review("r1", "A", "2026-10-01T00:00:00Z", [finding("1", "a.ts"), finding("2", "b.ts", true)]),
      review("r2", "B", "2026-10-01T00:00:00Z", [finding("3", "a.ts")]),
    ]);
    expect(byFile.get("a.ts")?.map((f) => f.id)).toEqual(["1", "3"]);
    expect(byFile.get("b.ts")?.map((f) => f.id)).toEqual(["2"]);
    expect(filesWithFindings(["a.ts", "b.ts", "c.ts"], byFile)).toBe(1);
  });

  it("countsAsFinding is false only for dismissed findings", () => {
    expect(countsAsFinding(finding("1", "a.ts"))).toBe(true);
    expect(countsAsFinding(finding("2", "a.ts", true))).toBe(false);
  });
});
