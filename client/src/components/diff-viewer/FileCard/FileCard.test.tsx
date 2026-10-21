import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrReviewComment } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import shellMessages from "../../../../messages/en/shell.json";
import type { DiffCommentApi } from "../comments";
import type { DiffFindingApi } from "../findings";
import type { DiffFocus } from "../focus";
import { bigPatch, stubScrollIntoView, type ScrollCall } from "@/test/scroll-into-view";
import { FileCard } from "./FileCard";

afterEach(cleanup);

const FILE: PrFile = {
  path: "src/config.ts",
  additions: 1,
  deletions: 0,
  patch: "@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: \"sk_live_xxx\",\n   redisUrl: x,",
};

const finding = (id: string, start_line: number, over: Partial<FindingRecord> = {}): FindingRecord => ({
  id,
  severity: "CRITICAL",
  category: "security",
  title: `Finding ${id}`,
  file: "src/config.ts",
  start_line,
  end_line: start_line,
  rationale: "r",
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

const api = (findings: FindingRecord[], show = true): DiffFindingApi => ({
  findings,
  show,
  renderFinding: (f) => <div data-testid="finding-card">{f.title}</div>,
  severityLabel: (s) => (s === "CRITICAL" ? "blocker" : s.toLowerCase()),
});

const comment: PrReviewComment = {
  id: 1,
  path: "src/config.ts",
  line: 11,
  original_line: 11,
  side: "RIGHT",
  body: "nit",
  user: "octo",
  created_at: "2026-10-01T00:00:00Z",
  html_url: "https://github.com/x",
  in_reply_to_id: null,
  is_outdated: false,
};

const commenting = (show: boolean): DiffCommentApi => ({
  comments: [comment],
  canComment: false,
  showComments: show,
  posting: false,
  onSubmit: async () => undefined,
});

function renderCard(props: Partial<React.ComponentProps<typeof FileCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
      <FileCard file={FILE} {...props} />
    </NextIntlClientProvider>,
  );
}

const DOT = "This file has review findings";

describe("FileCard findings", () => {
  it("shows the dot, the line label + card under the line, and an unmatched footer", () => {
    renderCard({ findingApi: api([finding("on", 11), finding("off", 999)]) });
    expect(screen.getByRole("img", { name: DOT })).toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.getByText("Finding on")).toBeInTheDocument();
    expect(screen.getByText("1 finding on lines not in this diff")).toBeInTheDocument();
    expect(screen.getByText("Finding off")).toBeInTheDocument();
    // the card for line 11 renders before the footer card
    const cards = screen.getAllByTestId("finding-card").map((el) => el.textContent);
    expect(cards).toEqual(["Finding on", "Finding off"]);
  });

  it("no dot for dismissed-only findings or without a findingApi", () => {
    renderCard({ findingApi: api([finding("d", 11, { dismissed_at: "2026-10-01T00:00:00Z" })]) });
    expect(screen.queryByRole("img", { name: DOT })).not.toBeInTheDocument();
    // dismissed findings are still shown (muted by the card itself)
    expect(screen.getByText("Finding d")).toBeInTheDocument();
    cleanup();
    renderCard();
    expect(screen.queryByRole("img", { name: DOT })).not.toBeInTheDocument();
    expect(screen.getByText("stripeKey: \"sk_live_xxx\",")).toBeInTheDocument();
  });

  it("puts the unmatched-findings block last, after the outdated comments", () => {
    renderCard({
      findingApi: api([finding("off", 999)]),
      commenting: { ...commenting(true), comments: [{ ...comment, line: null }] },
    });
    const outdated = screen.getByText("1 comment(s) on older revisions");
    const unmatched = screen.getByText("1 finding on lines not in this diff");
    expect(outdated.compareDocumentPosition(unmatched) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("show:false hides cards, labels and footer but keeps the dot; the comment counter still works", () => {
    renderCard({
      findingApi: api([finding("on", 11), finding("off", 999)], false),
      commenting: commenting(false),
    });
    expect(screen.getByRole("img", { name: DOT })).toBeInTheDocument();
    expect(screen.queryByText("blocker")).not.toBeInTheDocument();
    expect(screen.queryByTestId("finding-card")).not.toBeInTheDocument();
    expect(screen.queryByText(/on lines not in this diff/)).not.toBeInTheDocument();
    // the comment counter in the header is separate from the dot
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});

/* L05 S11 — a focus target (file + line) from the PR Brief: FileCard is the only
   scroll owner. It forces itself open, highlights the line and scrolls exactly once. */
describe("FileCard focus target", () => {
  /** 300 changed lines → over AUTO_EXPAND_MAX_LINES, so the card starts collapsed. */
  const BIG: PrFile = { path: "src/big.ts", additions: 300, deletions: 0, patch: bigPatch(300) };
  let scroll: ReturnType<typeof stubScrollIntoView>;

  beforeEach(() => {
    scroll = stubScrollIntoView();
  });
  afterEach(() => {
    scroll.restore();
  });

  const renderFocused = (file: PrFile, focus: DiffFocus | null) =>
    render(
      <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
        <FileCard file={file} focus={focus} />
      </NextIntlClientProvider>,
    );

  /** Let effects and rAF callbacks settle, then report every scroll so far. */
  const settledScrolls = async (): Promise<ScrollCall[]> => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    return scroll.calls;
  };

  const highlighted = () => Array.from(document.querySelectorAll("[data-focus-line]"));

  it("an auto-collapsed 300-line file with a focus line opens, highlights the line and scrolls to it once", async () => {
    renderFocused(BIG, { path: "src/big.ts", line: 150 });

    const target = screen.getByText("line 150");
    expect(highlighted()).toHaveLength(1);
    expect(highlighted()[0]).toContainElement(target);

    await waitFor(() => expect(scroll.calls.length).toBeGreaterThan(0));
    const calls = await settledScrolls();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.el).toBe(highlighted()[0]);
    expect(calls[0]!.opts).toEqual(expect.objectContaining({ block: "center" }));
  });

  it("an already-open file with a focus line: one scroll, on the line", async () => {
    renderFocused(FILE, { path: "src/config.ts", line: 11 });

    const target = screen.getByText('stripeKey: "sk_live_xxx",');
    expect(highlighted()).toHaveLength(1);
    expect(highlighted()[0]).toContainElement(target);

    await waitFor(() => expect(scroll.calls.length).toBeGreaterThan(0));
    const calls = await settledScrolls();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.el).toBe(highlighted()[0]);
  });

  it("a line outside the patch: the card is scrolled into view and the 'not among the changed lines' notice shows", async () => {
    renderFocused(FILE, { path: "src/config.ts", line: 999 });

    expect(screen.getByRole("status")).toHaveTextContent("Line 999 isn't among the changed lines");
    expect(highlighted()).toHaveLength(0);

    await waitFor(() => expect(scroll.calls.length).toBeGreaterThan(0));
    const calls = await settledScrolls();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.el).toContainElement(screen.getByText("src/config.ts"));
    expect(calls[0]!.opts).toEqual(expect.objectContaining({ block: "start" }));
  });

  it("a file with no patch (binary / too large): the card is scrolled into view with the line notice", async () => {
    renderFocused({ path: "assets/logo.png", additions: 0, deletions: 0, patch: null }, {
      path: "assets/logo.png",
      line: 5,
    });

    expect(screen.getByRole("status")).toHaveTextContent("Line 5 isn't among the changed lines");
    await waitFor(() => expect(scroll.calls.length).toBeGreaterThan(0));
    const calls = await settledScrolls();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.el).toContainElement(screen.getByText("assets/logo.png"));
  });

  it("a focus on another file leaves this card alone: still collapsed, no highlight, no scroll", async () => {
    renderFocused(BIG, { path: "src/other.ts", line: 150 });

    expect(screen.getByText("src/big.ts")).toBeInTheDocument();
    expect(screen.queryByText("line 150")).not.toBeInTheDocument();
    expect(highlighted()).toHaveLength(0);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(await settledScrolls()).toHaveLength(0);
  });
});
