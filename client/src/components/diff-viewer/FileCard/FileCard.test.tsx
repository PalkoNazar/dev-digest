import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrReviewComment } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import shellMessages from "../../../../messages/en/shell.json";
import type { DiffCommentApi } from "../comments";
import type { DiffFindingApi } from "../findings";
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
