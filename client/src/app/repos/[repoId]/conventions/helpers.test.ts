import { describe, expect, it } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { buildSkillBody, evidenceLabel, skillNameFor, visibleCandidates } from "./helpers";

const candidate = (over: Partial<ConventionCandidate>): ConventionCandidate => ({
  id: "c1",
  category: "error-handling",
  rule: "Throw NotFoundError for a missing entity",
  evidence: [
    {
      path: "server/src/users/service.ts",
      line_start: 4,
      line_end: 5,
      snippet: "    if (!user)\n      throw new NotFoundError('user');",
    },
  ],
  confidence: 0.9,
  adherence: 0.94,
  support_files: 47,
  violation_files: 3,
  status: "accepted",
  edited: false,
  created_at: "",
  ...over,
});

describe("skillNameFor", () => {
  it("builds a valid skill slug from the repo name", () => {
    expect(skillNameFor("acme/payments-api")).toBe("payments-api-conventions");
    expect(skillNameFor("Acme/My_Repo.JS")).toBe("my-repo-js-conventions");
    expect(skillNameFor("x/___")).toBe("repo-conventions");
    expect(skillNameFor(`x/${"a".repeat(80)}`)).toMatch(/^a{52}-conventions$/);
  });
});

describe("evidenceLabel", () => {
  it("shows a single line or a range", () => {
    expect(evidenceLabel({ path: "a.ts", line_start: 3, line_end: 3, snippet: "" })).toBe("a.ts:3");
    expect(evidenceLabel({ path: "a.ts", line_start: 3, line_end: 9, snippet: "" })).toBe("a.ts:3-9");
  });
});

describe("visibleCandidates", () => {
  const list = [
    candidate({ id: "a", status: "pending" }),
    candidate({ id: "b", status: "accepted" }),
    candidate({ id: "c", status: "pending", enforced_by: "prettier (.prettierrc): quotes" }),
  ];
  it("filters by status and hides tooling-enforced rules unless asked", () => {
    expect(visibleCandidates(list, { status: "all", showTooling: false }).map((c) => c.id)).toEqual(["a", "b"]);
    expect(visibleCandidates(list, { status: "pending", showTooling: true }).map((c) => c.id)).toEqual(["a", "c"]);
    expect(visibleCandidates(list, { status: "rejected", showTooling: true })).toEqual([]);
  });
});

describe("buildSkillBody", () => {
  it("renders one numbered section per rule with measured adherence and the de-indented example", () => {
    const body = buildSkillBody("acme/payments-api", [
      candidate({}),
      candidate({ id: "c2", rule: "Await repository calls", category: "async", adherence: null, support_files: null, evidence: [] }),
    ]);
    expect(body).toContain("# payments-api-conventions");
    expect(body).toContain("House conventions of `acme/payments-api`");
    expect(body).toContain("## 1. Throw NotFoundError for a missing entity");
    expect(body).toContain("Followed in 94% of matching files (47/50).");
    expect(body).toContain("Example (`server/src/users/service.ts:4-5`):");
    expect(body).toContain("```ts\nif (!user)\n  throw new NotFoundError('user');\n```");
    expect(body).toContain("## 2. Await repository calls\n\nCategory: async.");
    expect(body.endsWith("Category: async.")).toBe(true);
  });
});
