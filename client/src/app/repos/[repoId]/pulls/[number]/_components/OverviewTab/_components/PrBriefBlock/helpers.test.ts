import { describe, it, expect } from "vitest";
import type { PrBrief, PrBriefResponse, ReviewRecord, RunSummary } from "@devdigest/shared";
import { isBriefStale, latestCompletedReview, noticeKeys, parseFileRef, shortSha } from "./helpers";

const brief = (head_sha: string) =>
  ({ run: { head_sha } }) as unknown as PrBrief;

describe("isBriefStale", () => {
  it("no brief → never stale", () => {
    expect(isBriefStale(undefined, "b")).toBe(false);
    expect(isBriefStale({ brief: null, stale: true }, "b")).toBe(false);
  });
  it("server flag wins; else compares the polled head locally", () => {
    const res = (stale: boolean): PrBriefResponse => ({ brief: brief("aaa"), stale });
    expect(isBriefStale(res(true), "aaa")).toBe(true);
    expect(isBriefStale(res(false), "aaa")).toBe(false);
    expect(isBriefStale(res(false), "bbb")).toBe(true);
    expect(isBriefStale(res(false), null)).toBe(false);
  });
});

describe("latestCompletedReview", () => {
  const review = (over: Partial<ReviewRecord>): ReviewRecord => ({
    id: "r",
    pr_id: "p",
    agent_id: null,
    run_id: null,
    agent_name: null,
    kind: "review",
    verdict: "comment",
    summary: null,
    score: null,
    model: null,
    created_at: "2026-10-01T00:00:00Z",
    findings: [],
    ...over,
  });
  const run = (over: Partial<RunSummary>): RunSummary => ({
    run_id: "run",
    agent_id: null,
    agent_name: null,
    provider: null,
    model: null,
    status: "done",
    error: null,
    duration_ms: null,
    tokens_in: null,
    tokens_out: null,
    cost_usd: null,
    findings_count: null,
    grounding: null,
    ran_at: null,
    score: null,
    blockers: null,
    ...over,
  });

  it("none without a verdict-bearing review", () => {
    expect(latestCompletedReview(undefined, undefined)).toBeNull();
    expect(latestCompletedReview([review({ kind: "summary" }), review({ verdict: null })], [])).toBeNull();
  });

  it("takes the newest review and joins its run by run_id for counts", () => {
    const got = latestCompletedReview(
      [
        review({ id: "old", run_id: "r1", verdict: "approve", created_at: "2026-10-01T00:00:00Z" }),
        review({ id: "new", run_id: "r2", verdict: "request_changes", score: 61, created_at: "2026-10-02T00:00:00Z" }),
      ],
      [run({ run_id: "r1", findings_count: 1 }), run({ run_id: "r2", findings_count: 6, blockers: 2 })],
    );
    expect(got).toEqual({ verdict: "request_changes", score: 61, findingsCount: 6, blockers: 2, agentName: null });
  });

  it("falls back to the review's own findings when the run is missing", () => {
    const got = latestCompletedReview([review({ run_id: "gone", findings: [{} as never, {} as never] })], []);
    expect(got).toMatchObject({ findingsCount: 2, blockers: 0 });
  });
});

describe("noticeKeys", () => {
  it("maps notes to message keys in order and drops duplicates", () => {
    expect(
      noticeKeys([
        { input: "intent", reason: "not_derived" },
        { input: "linked_issues", reason: "not_found", ref: "#12" },
        { input: "intent", reason: "not_derived", ref: null },
      ]),
    ).toEqual([
      { input: "notice.input.intent", reason: "notice.reason.not_derived", ref: null },
      { input: "notice.input.linked_issues", reason: "notice.reason.not_found", ref: "#12" },
    ]);
  });
});

describe("parseFileRef / shortSha", () => {
  it("splits path:line and path:line-line", () => {
    expect(parseFileRef("src/a.ts")).toEqual({ path: "src/a.ts", line: null });
    expect(parseFileRef("src/a.ts:12")).toEqual({ path: "src/a.ts", line: 12 });
    expect(parseFileRef("src/a.ts:12-18")).toEqual({ path: "src/a.ts", line: 12 });
    expect(parseFileRef("c:/x.ts")).toEqual({ path: "c:/x.ts", line: null });
  });
  it("shortens a sha", () => {
    expect(shortSha("0123456789abcdef")).toBe("0123456");
  });
});
