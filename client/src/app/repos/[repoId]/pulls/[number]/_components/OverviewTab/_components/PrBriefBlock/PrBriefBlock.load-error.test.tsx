/* B2 (AC-16/AC-99) repro: a failed GET /pulls/:id/brief must not look like "no brief yet". */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBriefResponse } from "@devdigest/shared";
import brief from "../../../../../../../../../../messages/en/brief.json";
import prReview from "../../../../../../../../../../messages/en/prReview.json";

const hooks = vi.hoisted(() => ({
  query: {
    data: undefined as PrBriefResponse | undefined,
    isLoading: false,
    isError: false,
    error: null as unknown,
  },
  refetch: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({ ...hooks.query, refetch: hooks.refetch }),
  useBriefGeneration: () => ({ isPending: false, error: null, generate: hooks.generate }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [] }),
  usePrRuns: () => ({ data: [] }),
}));

import { PrBriefBlock } from "./PrBriefBlock";

const tree = () => (
  <NextIntlClientProvider locale="en" messages={{ brief, prReview }}>
    <PrBriefBlock
      prId="pr-1"
      changedFiles={["src/a.ts"]}
      currentHeadSha="aaa1111222"
      onOpenInDiff={vi.fn()}
      intent={<div>INTENT SLOT</div>}
      blast={<div>BLAST SLOT</div>}
    />
  </NextIntlClientProvider>
);

afterEach(cleanup);

beforeEach(() => {
  hooks.query = { data: undefined, isLoading: false, isError: false, error: null };
  hooks.refetch.mockReset();
  hooks.generate.mockReset();
});

describe("PrBriefBlock › loading the stored brief fails (B2)", () => {
  it("GET fails → load-error state whose Retry re-reads the brief; no Generate brief CTA", () => {
    hooks.query = { data: undefined, isLoading: false, isError: true, error: new Error("Network down") };
    render(tree());

    expect(screen.queryByRole("button", { name: "Generate brief" })).toBeNull();
    expect(screen.queryByText("Brief not available yet.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(hooks.refetch).toHaveBeenCalledTimes(1);
    expect(hooks.generate).not.toHaveBeenCalled();
    // The slots around the brief still render.
    expect(screen.getByText("INTENT SLOT")).toBeInTheDocument();
    expect(screen.getByText("BLAST SLOT")).toBeInTheDocument();
  });

  it("guard: GET succeeds with { brief: null } → Generate brief, no load-error retry", () => {
    hooks.query = { data: { brief: null, stale: false }, isLoading: false, isError: false, error: null };
    render(tree());

    expect(screen.getByText("Brief not available yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(hooks.generate).toHaveBeenCalledTimes(1);
    expect(hooks.refetch).not.toHaveBeenCalled();
  });
});
