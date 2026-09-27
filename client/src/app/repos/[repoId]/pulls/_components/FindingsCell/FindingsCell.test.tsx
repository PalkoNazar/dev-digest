import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";

const reviews = vi.hoisted(() => ({ data: [] as ReviewRecord[] }));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: reviews.data, isLoading: false, isError: false }),
}));

import { FindingsCell } from "./FindingsCell";
import { cardPosition, findingHref, latestReview } from "./helpers";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const finding = (id: string, severity: FindingRecord["severity"]): FindingRecord => ({
  id,
  severity,
  category: "security",
  title: `${severity} ${id}`,
  file: "src/app.ts",
  start_line: 3,
  end_line: 5,
  rationale: "why",
  suggestion: null,
  confidence: 0.7,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r",
  accepted_at: null,
  dismissed_at: null,
});

const review = (id: string, created_at: string, findings: FindingRecord[]): ReviewRecord => ({
  id,
  pr_id: "pr1",
  agent_id: null,
  run_id: null,
  kind: "review",
  verdict: null,
  summary: null,
  score: 50,
  model: null,
  created_at,
  findings,
});

describe("FindingsCell", () => {
  it("shows — when the PR was never reviewed, 0 when the review is clean", () => {
    renderWithIntl(<FindingsCell prId="pr1" prHref="/repos/r1/pulls/5" counts={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    cleanup();
    renderWithIntl(<FindingsCell prId="pr1" prHref="/repos/r1/pulls/5" counts={{ critical: 0, warning: 0, suggestion: 0 }} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("shows only non-zero severities", () => {
    renderWithIntl(<FindingsCell prId="pr1" prHref="/repos/r1/pulls/5" counts={{ critical: 7, warning: 3, suggestion: 0 }} />);
    expect(screen.getByTitle("Critical")).toHaveTextContent("7");
    expect(screen.getByTitle("Warning")).toHaveTextContent("3");
    expect(screen.queryByTitle("Suggestion")).not.toBeInTheDocument();
  });

  it("hover opens a card with the latest review's findings, most severe first", () => {
    reviews.data = [
      review("old", "2026-01-01T00:00:00Z", [finding("x", "CRITICAL")]),
      review("new", "2026-01-02T00:00:00Z", [finding("w", "WARNING"), finding("c", "CRITICAL")]),
    ];
    renderWithIntl(<FindingsCell prId="pr1" prHref="/repos/r1/pulls/5" counts={{ critical: 1, warning: 1, suggestion: 0 }} />);
    fireEvent.mouseEnter(screen.getByLabelText("2 findings"));

    const card = screen.getByRole("dialog");
    expect(card).toHaveTextContent("2 findings");
    const titles = [...card.querySelectorAll("span")]
      .map((el) => el.textContent)
      .filter((txt) => /^(CRITICAL|WARNING) /.test(txt ?? ""));
    expect(titles).toEqual(["CRITICAL c", "WARNING w"]);
    expect(card).toHaveTextContent("src/app.ts:3-5");
    expect(screen.queryByText("CRITICAL x")).not.toBeInTheDocument();
  });
});

describe("FindingsCell keyboard", () => {
  const counts = { critical: 1, warning: 0, suggestion: 0 };
  const trigger = () => screen.getByRole("button", { name: "1 finding" });

  it("is a focusable button; focus opens the card, Escape closes it", () => {
    reviews.data = [review("r", "2026-01-01T00:00:00Z", [finding("c", "CRITICAL")])];
    renderWithIntl(<FindingsCell prId="pr1" prHref="/repos/r1/pulls/5" counts={counts} />);
    expect(trigger()).toHaveAttribute("tabindex", "0");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");

    fireEvent.focus(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(trigger()).toHaveAttribute("aria-controls", screen.getByRole("dialog").id);
    expect(screen.getByRole("dialog")).toHaveTextContent("CRITICAL c");

    fireEvent.keyDown(trigger(), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Enter / Space toggle the card", () => {
    renderWithIntl(<FindingsCell prId="pr1" prHref="/repos/r1/pulls/5" counts={counts} />);
    fireEvent.keyDown(trigger(), { key: "Enter" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(trigger(), { key: " " });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("blur closes the card after the grace delay", () => {
    vi.useFakeTimers();
    try {
      renderWithIntl(<FindingsCell prId="pr1" prHref="/repos/r1/pulls/5" counts={counts} />);
      fireEvent.focus(trigger());
      fireEvent.blur(trigger());
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(200));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("FindingsCell inside a clickable row", () => {
  it("each finding links to its spot on the PR page", () => {
    reviews.data = [review("r", "2026-01-01T00:00:00Z", [finding("c", "CRITICAL"), finding("w", "WARNING")])];
    renderWithIntl(<FindingsCell prId="pr1" prHref="/repos/r1/pulls/5" counts={{ critical: 1, warning: 1, suggestion: 0 }} />);
    fireEvent.mouseEnter(screen.getByRole("button", { name: "2 findings" }));
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/repos/r1/pulls/5?tab=findings&finding=c",
      "/repos/r1/pulls/5?tab=findings&finding=w",
    ]);
    expect(links[0]).toHaveTextContent("CRITICAL c");
  });

  it("clicking a finding doesn't also trigger the row's click (PR root)", () => {
    reviews.data = [review("r", "2026-01-01T00:00:00Z", [finding("c", "CRITICAL")])];
    const rowClick = vi.fn();
    renderWithIntl(
      <div onClick={rowClick}>
        <FindingsCell prId="pr1" prHref="/repos/r1/pulls/5" counts={{ critical: 1, warning: 0, suggestion: 0 }} />
      </div>,
    );
    const trigger = screen.getByRole("button", { name: "1 finding" });
    fireEvent.mouseEnter(trigger);
    // Card chrome (header) — a finding's own <a> navigates by itself.
    fireEvent.click(screen.getByRole("dialog").firstElementChild!);
    expect(rowClick).not.toHaveBeenCalled();

    fireEvent.click(trigger); // the counts themselves stay part of the row
    expect(rowClick).toHaveBeenCalledTimes(1);
  });
});

describe("FindingsCell open state", () => {
  it("doesn't reopen the card by itself after counts drop to 0 and come back", () => {
    reviews.data = [review("r", "2026-01-01T00:00:00Z", [finding("c", "CRITICAL")])];
    const one = { critical: 1, warning: 0, suggestion: 0 };
    const cell = (counts: typeof one) => (
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsCell prId="pr1" prHref="/repos/r1/pulls/5" counts={counts} />
      </NextIntlClientProvider>
    );
    const { rerender } = render(cell(one));
    fireEvent.mouseEnter(screen.getByLabelText("1 finding"));
    fireEvent.mouseEnter(screen.getByRole("dialog")); // pointer moved into the card

    rerender(cell({ critical: 0, warning: 0, suggestion: 0 })); // card vanishes, no mouseleave
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(cell(one));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("helpers", () => {
  it("findingHref opens the Findings tab on one finding", () => {
    expect(findingHref("/repos/r1/pulls/5", "f-1")).toBe("/repos/r1/pulls/5?tab=findings&finding=f-1");
  });

  it("latestReview ignores summaries and picks the newest review", () => {
    const summary = { ...review("s", "2026-02-01T00:00:00Z", []), kind: "summary" as const };
    const a = review("a", "2026-01-01T00:00:00Z", []);
    const b = review("b", "2026-01-03T00:00:00Z", []);
    expect(latestReview([a, summary, b])?.id).toBe("b");
    expect(latestReview([summary])).toBeUndefined();
  });

  it("cardPosition opens below when it fits, above otherwise, clamped to the viewport", () => {
    const vp = { width: 1200, height: 900 };
    expect(cardPosition({ left: 100, top: 100, bottom: 130 }, vp)).toEqual({ left: 100, top: 136 });
    expect(cardPosition({ left: 100, top: 800, bottom: 830 }, vp)).toEqual({ left: 100, bottom: 106 });
    expect(cardPosition({ left: 1100, top: 100, bottom: 130 }, vp).left).toBe(792);
  });
});
