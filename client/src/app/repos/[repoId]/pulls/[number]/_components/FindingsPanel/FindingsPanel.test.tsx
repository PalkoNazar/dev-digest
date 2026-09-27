import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

const FINDINGS: FindingRecord[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

function finding(id: string, severity: FindingRecord["severity"], confidence = 0.9): FindingRecord {
  return { ...FINDINGS[0]!, id, severity, confidence, title: `${severity} finding ${id}` };
}

const MIXED: FindingRecord[] = [
  finding("c1", "CRITICAL"),
  finding("c2", "CRITICAL", 0.4),
  finding("w1", "WARNING"),
];

const chip = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label}`) });

describe("FindingsPanel severity filter", () => {
  it("shows a count chip per severity, including zero", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(chip("Critical")).toHaveTextContent("Critical2");
    expect(chip("Warning")).toHaveTextContent("Warning1");
    expect(chip("Suggestion")).toHaveTextContent("Suggestion0");
  });

  it("click shows only that severity; clicking it again shows all", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(screen.queryByRole("button", { pressed: true })).not.toBeInTheDocument();

    fireEvent.click(chip("Warning"));
    expect(screen.getByRole("button", { pressed: true })).toBe(chip("Warning"));
    expect(chip("Critical")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("WARNING finding w1")).toBeInTheDocument();
    expect(screen.queryByText("CRITICAL finding c1")).not.toBeInTheDocument();

    fireEvent.click(chip("Warning"));
    expect(chip("Warning")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("CRITICAL finding c1")).toBeInTheDocument();
    expect(screen.getByText("WARNING finding w1")).toBeInTheDocument();
  });

  it("a level with no findings shows the empty state", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(chip("Suggestion"));
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });

  it("counts ignore hide-low-confidence", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.queryByText("CRITICAL finding c2")).not.toBeInTheDocument();
    expect(chip("Critical")).toHaveTextContent("Critical2");
  });
});

describe("FindingsPanel deep link (?finding=)", () => {
  it("expands the target finding and scrolls it into view", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const target = { ...finding("w1", "WARNING"), rationale: "Target rationale." };
    renderWithIntl(<FindingsPanel findings={[...MIXED.slice(0, 2), target]} prId="pr1" targetFindingId="w1" />);

    expect(screen.getByText("Target rationale.")).toBeInTheDocument();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(document.querySelector('[data-finding-id="w1"]'));
  });

  it("ignores an id that isn't in this run", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" targetFindingId={'x"]'} />);
    expect(scroll).not.toHaveBeenCalled();
  });
});
