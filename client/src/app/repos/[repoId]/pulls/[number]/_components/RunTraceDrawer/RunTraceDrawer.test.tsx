import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: {
    system: "You are a reviewer.",
    skills: "### secret-leakage-gate",
    skills_tokens: 42,
    memory: null,
    specs: null,
    user: "Review PR #482",
  },
  skills_used: [{ id: "s1", name: "secret-leakage-gate", version: 2 }],
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

// The trace the mocked hook returns; a test may swap it (reset after each test).
let currentTrace: RunTrace = TRACE;

vi.mock("../../../../../../../lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: currentTrace, isLoading: false }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";

afterEach(cleanup);
afterEach(() => {
  currentTrace = TRACE;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("COST")).toBeInTheDocument();
    expect(screen.getByText("$0.06")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("shows which skills the run used and the tokens they added", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("secret-leakage-gate v2")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("1 skill · +42 tok")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });
});

/* L05 S12 — "Specs read" row and the Project context prompt block (AC-50–AC-55). */
const SPECS_TITLE = "Project context — attached specs (untrusted)";
const ALPHA_TEXT = "Alpha spec body, exactly as injected.";
const BIG_TEXT = "Big doc head, cut at the per-document limit.";

const CONTEXT_TRACE: RunTrace = {
  ...TRACE,
  prompt_assembly: {
    ...TRACE.prompt_assembly,
    specs: "## Project context\n<untrusted source=\"specs/alpha.md\">…</untrusted>",
  },
  specs_read: ["specs/alpha.md", "docs/big.md"],
  project_context: [
    { path: "specs/alpha.md", status: "injected", text: ALPHA_TEXT, tokens: 120 },
    { path: "docs/big.md", status: "truncated", text: BIG_TEXT, tokens: 500 },
    { path: "docs/gone.md", status: "omitted", text: null, tokens: null },
  ],
};

describe("L05 Run Trace — project context", () => {
  it("renders a legacy trace with 'none' in Specs read and no Project context block (AC-55)", () => {
    const { project_context: _omit, ...legacy } = TRACE as RunTrace & { project_context?: unknown };
    currentTrace = { ...legacy, specs_read: [] };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);

    const specsRow = screen.getByText("Specs read").parentElement!;
    expect(within(specsRow).getByText("none")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.queryByText(SPECS_TITLE)).not.toBeInTheDocument();
  });

  it("shows injected docs with truncated/omitted tags and the Project context block (AC-50–AC-54)", () => {
    currentTrace = CONTEXT_TRACE;
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);

    // Specs read: injected paths, the truncated tag, then the omitted path with its tag.
    const specsRow = screen.getByText("Specs read").parentElement!;
    expect(within(specsRow).getByText("specs/alpha.md")).toBeInTheDocument();
    expect(within(specsRow).getByText("docs/big.md")).toBeInTheDocument();
    expect(within(specsRow).getByText("docs/gone.md")).toBeInTheDocument();
    expect(within(specsRow).getByText(/^truncated$/i)).toBeInTheDocument();
    expect(within(specsRow).getByText(/^omitted$/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Prompt assembly"));
    const title = screen.getByText(SPECS_TITLE);
    expect(screen.getByText("2 docs · +620 tok")).toBeInTheDocument();

    // Open the block if it starts collapsed (its rows are not rendered yet).
    if (screen.getAllByText("specs/alpha.md").length < 2) fireEvent.click(title);
    // The block's row comes after the Specs read row in the drawer.
    const alphaRows = screen.getAllByText("specs/alpha.md");
    expect(alphaRows.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(alphaRows[alphaRows.length - 1]!);
    expect(screen.getByText(ALPHA_TEXT)).toBeInTheDocument();

    // The truncated doc is tagged in the block too.
    expect(screen.getAllByText(/^truncated$/i).length).toBeGreaterThanOrEqual(2);
  });
});
