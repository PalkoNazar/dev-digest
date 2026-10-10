import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/blast.json";

const blast = vi.hoisted(() => ({
  state: { data: undefined as BlastRadius | undefined, isLoading: false, isError: false },
  refetch: vi.fn(),
}));
const intel = vi.hoisted(() => ({
  state: undefined as { updatedAt: string } | undefined,
  poll: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock("@/lib/hooks/blast", () => ({
  usePrBlast: () => ({ ...blast.state, refetch: blast.refetch }),
}));
vi.mock("@/lib/hooks/repo-intel", () => ({
  useRepoIntelStatus: (_repoId: string, poll: boolean) => {
    intel.poll(poll);
    return { data: intel.state };
  },
  useResyncRepoIntel: () => ({ mutate: intel.mutate, isPending: false }),
}));

import { BlastRadiusCard } from "./BlastRadiusCard";

const MAP: BlastRadius = {
  changed_symbols: [
    { name: "buildPrompt", file: "src/prompt.ts", kind: "function" },
    { name: "Repo", file: "src/repo.ts", kind: "class" },
  ],
  downstream: [
    {
      symbol: "buildPrompt",
      callers: [
        { name: "runReview", file: "src/a.ts", line: 12 },
        { name: "preview", file: "src/b.ts", line: 40 },
      ],
      endpoints_affected: ["POST /runs"],
      crons_affected: ["nightly-digest"],
    },
    {
      symbol: "Repo",
      callers: [{ name: "boot", file: "src/c.ts", line: 3 }],
      endpoints_affected: [],
      crons_affected: [],
    },
  ],
  summary: "2 changed symbols · 3 callers · 1 endpoint · 1 cron",
  degraded: false,
  stats: { symbols: 2, callers: 3, endpoints: 1, crons: 1 },
  index_sha: "idx123",
};

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastRadiusCard prId="pr1" repoId="r1" repoFullName="acme/shop" headSha="head456" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  blast.state = { data: undefined, isLoading: false, isError: false };
  blast.refetch.mockReset();
  intel.state = undefined;
  intel.poll.mockReset();
  intel.mutate.mockReset();
});
afterEach(cleanup);

describe("BlastRadiusCard", () => {
  it("shows counts, caller links at the index SHA and separate endpoint/cron chips; symbols collapse", () => {
    blast.state.data = MAP;
    renderCard();

    expect(screen.getByTestId("blast-stats")).toHaveTextContent(
      /^2 symbols\s*·\s*3 callers\s*·\s*1 endpoint\s*·\s*1 cron job$/,
    );

    // first symbol open by default, with a call suffix for functions
    const first = screen.getByRole("button", { name: /buildPrompt\(\)\s*2 callers/ });
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "src/a.ts:12" })).toHaveAttribute(
      "href",
      "https://github.com/acme/shop/blob/idx123/src/a.ts#L12",
    );
    expect(screen.getByText("runReview")).toBeInTheDocument();

    const endpoints = screen.getByText("Endpoints").parentElement as HTMLElement;
    const crons = screen.getByText("Cron jobs").parentElement as HTMLElement;
    expect(within(endpoints).getByText("POST /runs")).toBeInTheDocument();
    expect(within(endpoints).queryByText("nightly-digest")).not.toBeInTheDocument();
    expect(within(crons).getByText("nightly-digest")).toBeInTheDocument();

    // second symbol starts collapsed; header toggles both ways
    const second = screen.getByRole("button", { name: /^Repo\s*1 caller$/ });
    expect(second).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "src/c.ts:3" })).not.toBeInTheDocument();
    fireEvent.click(second);
    expect(screen.getByRole("link", { name: "src/c.ts:3" })).toBeInTheDocument();
    fireEvent.click(first);
    expect(screen.queryByRole("link", { name: "src/a.ts:12" })).not.toBeInTheDocument();
  });

  it("shows the empty state when nothing calls the changed symbols", () => {
    blast.state.data = { ...MAP, downstream: [], stats: { symbols: 2, callers: 0, endpoints: 0, crons: 0 } };
    renderCard();
    expect(screen.getByText("2 changed symbols, no downstream callers found.")).toBeInTheDocument();
    expect(screen.queryByText("Index incomplete")).not.toBeInTheDocument();
  });

  it("shows the degraded reason, resyncs, and re-reads the map once a new index lands", () => {
    blast.state.data = {
      ...MAP,
      downstream: [],
      degraded: true,
      reason: "index_partial",
      stats: { symbols: 2, callers: 0, endpoints: 0, crons: 0 },
    };
    intel.state = { updatedAt: "t1" };
    const view = renderCard();

    expect(screen.getByText("Index incomplete")).toBeInTheDocument();
    expect(screen.getByText(/The code index is partial/)).toBeInTheDocument();
    expect(intel.poll).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    expect(intel.mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Resyncing/ })).toBeDisabled();
    expect(intel.poll).toHaveBeenLastCalledWith(true);
    expect(blast.refetch).not.toHaveBeenCalled();

    intel.state = { updatedAt: "t2" };
    view.rerender(
      <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
        <BlastRadiusCard prId="pr1" repoId="r1" repoFullName="acme/shop" headSha="head456" />
      </NextIntlClientProvider>,
    );
    expect(blast.refetch).toHaveBeenCalledTimes(1);
    expect(intel.poll).toHaveBeenLastCalledWith(false);
  });

  it("takes the first index state seen after a too-early click as the baseline", () => {
    blast.state.data = { ...MAP, degraded: true, reason: "no_data" };
    intel.state = undefined; // index state not loaded yet
    const view = renderCard();
    const rerender = () =>
      view.rerender(
        <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
          <BlastRadiusCard prId="pr1" repoId="r1" repoFullName="acme/shop" headSha="head456" />
        </NextIntlClientProvider>,
      );

    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    intel.state = { updatedAt: "old" }; // first response: the pre-resync state
    rerender();
    expect(blast.refetch).not.toHaveBeenCalled();
    expect(intel.poll).toHaveBeenLastCalledWith(true);

    intel.state = { updatedAt: "new" };
    rerender();
    expect(blast.refetch).toHaveBeenCalledTimes(1);
    expect(intel.poll).toHaveBeenLastCalledWith(false);
  });

  it("offers a retry when the map fails to load", () => {
    blast.state.isError = true;
    renderCard();
    expect(screen.getByText("Could not load the blast radius")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(blast.refetch).toHaveBeenCalledTimes(1);
  });
});
