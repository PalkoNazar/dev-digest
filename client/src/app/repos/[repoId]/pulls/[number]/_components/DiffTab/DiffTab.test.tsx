import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, PrReviewComment, ReviewRecord, SmartDiff } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";

const hooks = vi.hoisted(() => ({
  reviews: undefined as ReviewRecord[] | undefined,
  comments: [] as PrReviewComment[],
  smart: { data: undefined as SmartDiff | undefined },
  mutate: vi.fn(),
}));

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: hooks.comments }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePrReviews: () => ({ data: hooks.reviews }),
  useSmartDiff: () => hooks.smart,
  useFindingAction: () => ({ mutate: hooks.mutate, isPending: false, variables: undefined }),
}));

import { DiffTab } from "./DiffTab";

afterEach(cleanup);

const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';
/** GitHub's order. */
const FILES: PrFile[] = [
  { path: "README.md", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n # x\n+more" },
  { path: "pnpm-lock.yaml", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n a\n+b" },
  { path: "src/config.ts", additions: 1, deletions: 0, patch: PATCH },
  { path: "src/config.test.ts", additions: 1, deletions: 0, patch: PATCH },
];
const sf = (path: string) => ({ path, additions: 1, deletions: 0, finding_lines: [] });
const SMART: SmartDiff = {
  groups: [
    { role: "core", files: [sf("src/config.ts")] },
    { role: "tests", files: [sf("src/config.test.ts")] },
    { role: "docs", files: [sf("README.md")] },
    { role: "boilerplate", files: [sf("pnpm-lock.yaml")] },
  ],
  split_suggestion: { too_big: false, total_lines: 4, proposed_splits: [] },
};

const finding = (id: string, file: string, over: Partial<FindingRecord> = {}): FindingRecord => ({
  id,
  severity: "CRITICAL",
  category: "security",
  title: `Finding ${id}`,
  file,
  start_line: 11,
  end_line: 11,
  rationale: "Rationale text.",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
  ...over,
});

const review = (findings: FindingRecord[]): ReviewRecord => ({
  id: "r1",
  pr_id: "pr1",
  agent_id: "A",
  run_id: null,
  agent_name: "Sec",
  kind: "review",
  verdict: "request_changes",
  summary: null,
  score: 60,
  model: "m",
  grounding: null,
  created_at: "2026-10-01T00:00:00Z",
  findings,
});

const COMMENT: PrReviewComment = {
  id: 1,
  path: "src/config.ts",
  line: 10,
  original_line: 10,
  side: "RIGHT",
  body: "nit comment",
  user: "octo",
  created_at: "2026-10-01T00:00:00Z",
  html_url: "https://github.com/x",
  in_reply_to_id: null,
  is_outdated: false,
};

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <DiffTab prId="pr1" filesCount={FILES.length} files={FILES} />
    </NextIntlClientProvider>,
  );
}

/** Group headers are the buttons carrying aria-expanded. */
const groupHeaders = () =>
  screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-expanded"));

const PATH_RE = /^(README\.md|pnpm-lock\.yaml|src\/config\.ts|src\/config\.test\.ts)$/;

describe("DiffTab", () => {
  beforeEach(() => {
    hooks.reviews = [review([finding("crit", "src/config.ts")])];
    hooks.comments = [];
    hooks.smart = { data: SMART };
    hooks.mutate.mockReset();
  });

  it("smart order: groups in role order, the lock file in collapsed boilerplate", () => {
    renderTab();
    const headers = groupHeaders();
    expect(headers.map((h) => h.textContent)).toEqual([
      expect.stringContaining("Core"),
      expect.stringContaining("Tests"),
      expect.stringContaining("Docs"),
      expect.stringContaining("Boilerplate"),
    ]);
    expect(headers[3]).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
    fireEvent.click(headers[3]!);
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
  });

  it("a finding on src/config.ts:11 → core ● 1, the card under the line, Accept calls the mutation", () => {
    renderTab();
    const core = groupHeaders()[0]!;
    expect(within(core).getByLabelText("1 file with findings")).toHaveTextContent("● 1");
    expect(within(groupHeaders()[1]!).queryByText(/●/)).not.toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.getByText("Finding crit")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(hooks.mutate).toHaveBeenCalledWith({ findingId: "crit", action: "accept", prId: "pr1" });
  });

  it("Original order shows the files in GitHub's order without role headers", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(groupHeaders()).toHaveLength(0);
    expect(screen.getAllByText(PATH_RE).map((el) => el.textContent)).toEqual(FILES.map((f) => f.path));
  });

  it("falls back to original order while the smart diff is loading or failed", () => {
    hooks.smart = { data: undefined };
    renderTab();
    expect(groupHeaders()).toHaveLength(0);
    expect(screen.getAllByText(PATH_RE).map((el) => el.textContent)).toEqual(FILES.map((f) => f.path));
    expect(screen.getByRole("button", { name: "Smart order" })).toHaveAttribute("aria-pressed", "true");
  });

  it("before any review: 'review not run yet', no ● counters", () => {
    hooks.reviews = [];
    renderTab();
    expect(screen.getByText(/Review not run yet/)).toBeInTheDocument();
    expect(screen.queryByText(/●/)).not.toBeInTheDocument();
  });

  it("Hide hides finding cards; the count is comments + active findings", () => {
    hooks.comments = [COMMENT];
    renderTab();
    expect(screen.getByText("Finding crit")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Hide comments & findings \(2\)/ }));
    expect(screen.queryByText("Finding crit")).not.toBeInTheDocument();
    expect(screen.queryByText("blocker")).not.toBeInTheDocument();
    // the dot and ● stay
    expect(within(groupHeaders()[0]!).getByLabelText("1 file with findings")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show comments & findings \(2\)/ }));
    expect(screen.getByText("Finding crit")).toBeInTheDocument();
  });

  it("a dismissed finding is shown muted but not counted", () => {
    hooks.reviews = [
      review([
        finding("crit", "src/config.ts"),
        finding("gone", "src/config.test.ts", { dismissed_at: "2026-10-02T00:00:00Z" }),
      ]),
    ];
    renderTab();
    expect(screen.getByRole("button", { name: /Hide comments & findings \(1\)/ })).toBeInTheDocument();
    expect(screen.getByText("Finding gone")).toBeInTheDocument();
    expect(screen.getByText("dismissed")).toBeInTheDocument();
    expect(within(groupHeaders()[1]!).queryByText(/●/)).not.toBeInTheDocument();
  });
});
