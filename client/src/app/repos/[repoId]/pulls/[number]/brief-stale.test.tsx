/* B1 (AC-19) repro at page level: which head the PR Brief's stale badge compares with.
   GET /pulls/:id refreshes the PR from GitHub, so the detail head can be AHEAD of the
   cached (60 s polled) list head. Data hooks are mocked at the @/lib/hooks boundary. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { PrBrief, PrBriefResponse } from "@devdigest/shared";
import brief from "../../../../../../messages/en/brief.json";
import blast from "../../../../../../messages/en/blast.json";
import prReview from "../../../../../../messages/en/prReview.json";

const state = vi.hoisted(() => ({
  listHead: "aaa1111222",
  detailHead: "aaa1111222",
  brief: undefined as unknown,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo-1", number: "7" }),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: null, repos: [], reposLoaded: false }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/hooks", () => ({
  usePulls: () => ({
    data: [{ id: "pr-1", number: 7, head_sha: state.listHead }],
    isLoading: false,
  }),
  usePullDetail: () => ({
    data: {
      id: "pr-1",
      number: 7,
      title: "Add limiter",
      author: "dev",
      branch: "feat/x",
      base: "main",
      additions: 1,
      deletions: 0,
      status: "open",
      body: null,
      head_sha: state.detailHead,
      files: [],
      files_count: 0,
      commits: [],
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [], refetch: vi.fn() }),
  usePrRuns: () => ({ data: [] }),
  usePrActiveRuns: () => ({ data: [] }),
  useCancelRun: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRun: () => ({ mutate: vi.fn(), isPending: false }),
  useRunReview: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/agents", () => ({ useAgents: () => ({ data: [] }) }));
vi.mock("@/lib/hooks/intent", () => ({
  usePrIntent: () => ({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() }),
  useDeriveIntent: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/blast", () => ({
  usePrBlast: () => ({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/lib/hooks/repo-intel", () => ({
  useRepoIntelStatus: () => ({ data: undefined }),
  useResyncRepoIntel: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({
    data: state.brief,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useBriefGeneration: () => ({ generate: vi.fn(), isPending: false, error: null }),
}));

import PRDetailPage from "./page";

const STALE_TEXT = "PR changed since this brief was generated";

const briefAt = (head_sha: string): PrBriefResponse => ({
  brief: {
    summary: "Adds a limiter.",
    risks: { risks: [] },
    review_focus: [],
    intent: null,
    blast: null,
    history: null,
    inputs: [],
    removed: { risks: 0, file_refs: 0, review_focus: 0 },
    run: {
      provider: "openrouter",
      model: "gpt-x",
      tokens_in: 10,
      tokens_out: 5,
      cost_usd: 0.001,
      duration_ms: 1000,
      est_input_tokens: 10,
      head_sha,
      generated_at: "2026-10-20T10:00:00Z",
    },
  } as PrBrief,
  // The server compared with the detail-refreshed head: B == B → not stale.
  stale: false,
});

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ brief, blast, prReview }}>
        <PRDetailPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );

afterEach(cleanup);

beforeEach(() => {
  state.listHead = "aaa1111222";
  state.detailHead = "aaa1111222";
  state.brief = undefined;
});

describe("PR detail page › PR Brief stale badge (B1, AC-19)", () => {
  it("list head A lags behind the detail head B; brief generated at B → no stale badge", () => {
    state.listHead = "aaa1111222";
    state.detailHead = "bbb2222333";
    state.brief = briefAt("bbb2222333");
    renderPage();
    expect(screen.getByText("Adds a limiter.")).toBeInTheDocument();
    expect(screen.queryByText(STALE_TEXT)).toBeNull();
  });

  it("guard: brief at A, list and detail both at B → stale badge", () => {
    state.listHead = "bbb2222333";
    state.detailHead = "bbb2222333";
    state.brief = briefAt("aaa1111222");
    renderPage();
    expect(screen.getByText("Adds a limiter.")).toBeInTheDocument();
    expect(screen.getByText(STALE_TEXT)).toBeInTheDocument();
  });
});
