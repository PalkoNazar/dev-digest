import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBrief, PrBriefResponse, ReviewRecord, RunSummary } from "@devdigest/shared";
import brief from "../../../../../../../../../../messages/en/brief.json";
import prReview from "../../../../../../../../../../messages/en/prReview.json";

const hooks = vi.hoisted(() => ({
  query: { data: undefined as PrBriefResponse | undefined, isLoading: false },
  gen: { isPending: false, error: null as unknown },
  generate: vi.fn(),
  reviews: [] as ReviewRecord[],
  runs: [] as RunSummary[],
}));

vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => hooks.query,
  useBriefGeneration: () => ({ ...hooks.gen, generate: hooks.generate }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: hooks.reviews }),
  usePrRuns: () => ({ data: hooks.runs }),
}));

import { PrBriefBlock } from "./PrBriefBlock";

afterEach(cleanup);

const BRIEF: PrBrief = {
  summary: "Adds a limiter <b>before</b> auth.",
  risks: {
    risks: [{ kind: "auth", title: "Auth surface touched", explanation: "x", severity: "high", file_refs: ["src/a.ts:3"] }],
  },
  review_focus: [{ file: "src/a.ts", line: 3, reason: "check order", outside_changed_lines: false }],
  intent: null,
  blast: null,
  history: null,
  inputs: [
    { input: "intent", reason: "not_derived" },
    { input: "linked_issues", reason: "not_found", ref: "#12" },
  ],
  removed: { risks: 1, file_refs: 0, review_focus: 2 },
  run: {
    provider: "openrouter",
    model: "gpt-x",
    tokens_in: 8200,
    tokens_out: 1300,
    cost_usd: 0.014,
    duration_ms: 3400,
    est_input_tokens: 7000,
    head_sha: "aaa1111222",
    generated_at: "2026-10-20T10:00:00Z",
  },
};

const tree = (currentHeadSha: string | null = "aaa1111222", onOpen = vi.fn()) => (
  <NextIntlClientProvider locale="en" messages={{ brief, prReview }}>
    <PrBriefBlock
      prId="pr-1"
      changedFiles={["src/a.ts"]}
      currentHeadSha={currentHeadSha}
      onOpenInDiff={onOpen}
      intent={<div>INTENT SLOT</div>}
      blast={<div>BLAST SLOT</div>}
    />
  </NextIntlClientProvider>
);

beforeEach(() => {
  hooks.query = { data: { brief: null, stale: false }, isLoading: false };
  hooks.gen = { isPending: false, error: null };
  hooks.generate.mockReset();
  hooks.reviews = [];
  hooks.runs = [];
});

const generateBtn = () => screen.getByRole("button", { name: "Generate brief" });
const regenerateBtn = () => screen.getByRole("button", { name: "Regenerate brief" });

describe("PrBriefBlock", () => {
  it("no brief → Generate brief asks for a generation; the intent and blast slots still show", () => {
    render(tree());
    expect(screen.getByText("PR Brief")).toBeInTheDocument();
    expect(screen.getByText("INTENT SLOT")).toBeInTheDocument();
    expect(screen.getByText("BLAST SLOT")).toBeInTheDocument();
    fireEvent.click(generateBtn());
    expect(hooks.generate).toHaveBeenCalledTimes(1);
  });

  it("loading the stored brief → controls disabled, nothing generated", () => {
    hooks.query = { data: undefined, isLoading: true };
    render(tree());
    expect(screen.getByRole("status", { name: "Loading the brief…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /brief/i })).toBeNull();
    expect(hooks.generate).not.toHaveBeenCalled();
  });

  it("pending → skeletons and a disabled refresh control; a remount while pending stays disabled", () => {
    hooks.query = { data: { brief: BRIEF, stale: false }, isLoading: false };
    hooks.gen = { isPending: true, error: null };
    const view = render(tree());
    expect(screen.getAllByTestId("brief-skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByText(BRIEF.summary)).toBeNull();
    expect(regenerateBtn()).toBeDisabled();

    // Tab switch: the block unmounts and mounts again while the POST is in flight.
    view.unmount();
    render(tree());
    expect(regenerateBtn()).toBeDisabled();
    fireEvent.click(regenerateBtn());
    expect(hooks.generate).not.toHaveBeenCalled();
  });

  it("brief → literal summary, Regenerate, meta, notices and removed counts; risks and focus jump", () => {
    hooks.query = { data: { brief: BRIEF, stale: false }, isLoading: false };
    const onOpen = vi.fn();
    render(tree("aaa1111222", onOpen));

    expect(screen.getByText("Adds a limiter <b>before</b> auth.")).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
    expect(screen.getByText("Model gpt-x")).toBeInTheDocument();
    expect(screen.getByText("8200→1300 tok")).toBeInTheDocument();
    expect(screen.getByText("Cost $0.014")).toBeInTheDocument();
    expect(screen.getByText("3.4s")).toBeInTheDocument();
    expect(screen.getByText("at aaa1111")).toBeInTheDocument();
    expect(screen.getByText("Generated without some inputs")).toBeInTheDocument();
    expect(screen.getByText("Intent: not derived yet")).toBeInTheDocument();
    expect(screen.getByText("Linked issues #12: not found")).toBeInTheDocument();
    expect(screen.getByText(/1 risk, 2 focus items/)).toBeInTheDocument();
    expect(screen.queryByText("PR changed since this brief was generated")).toBeNull();

    // One risk ref + one focus item point at the same changed line; both jump.
    const jumps = screen.getAllByRole("button", { name: "Open src/a.ts line 3 in Files changed" });
    expect(jumps).toHaveLength(2);
    for (const b of jumps) fireEvent.click(b);
    expect(onOpen.mock.calls).toEqual([
      ["src/a.ts", 3],
      ["src/a.ts", 3],
    ]);

    fireEvent.click(regenerateBtn());
    expect(hooks.generate).toHaveBeenCalledTimes(1);
  });

  it("the polled head moves A → B without a remount → stale badge, no generation", () => {
    hooks.query = { data: { brief: BRIEF, stale: false }, isLoading: false };
    const view = render(tree("aaa1111222"));
    expect(screen.queryByText("PR changed since this brief was generated")).toBeNull();
    view.rerender(tree("bbb2222333"));
    expect(screen.getByText("PR changed since this brief was generated")).toBeInTheDocument();
    expect(hooks.generate).not.toHaveBeenCalled();
  });

  it("a failed generation keeps the previous brief and offers Retry", () => {
    hooks.query = { data: { brief: BRIEF, stale: true }, isLoading: false };
    hooks.gen = { isPending: false, error: new Error("Brief generation timed out") };
    render(tree());
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't generate the brief");
    expect(screen.getByRole("alert")).toHaveTextContent("Brief generation timed out");
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    expect(screen.getByText("PR changed since this brief was generated")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(hooks.generate).toHaveBeenCalledTimes(1);
  });

  it("shows the verdict banner only with a completed review", () => {
    hooks.query = { data: { brief: BRIEF, stale: false }, isLoading: false };
    const view = render(tree());
    expect(screen.queryByText("PR SCORE")).toBeNull();
    view.unmount();

    hooks.reviews = [
      {
        id: "r1",
        pr_id: "pr-1",
        agent_id: "a1",
        run_id: "run-1",
        agent_name: "Security",
        kind: "review",
        verdict: "request_changes",
        summary: "review summary",
        score: 61,
        model: null,
        created_at: "2026-10-20T09:00:00Z",
        findings: [],
      },
    ];
    hooks.runs = [
      {
        run_id: "run-1",
        agent_id: "a1",
        agent_name: "Security",
        provider: null,
        model: null,
        status: "done",
        error: null,
        duration_ms: null,
        tokens_in: null,
        tokens_out: null,
        cost_usd: null,
        findings_count: 6,
        grounding: null,
        ran_at: null,
        score: 61,
        blockers: 2,
      },
    ];
    render(tree());
    expect(screen.getByText("PR SCORE")).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();
    expect(screen.getByText(/6 findings · 2 blockers/)).toBeInTheDocument();
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    expect(screen.queryByText("review summary")).toBeNull();
  });
});
