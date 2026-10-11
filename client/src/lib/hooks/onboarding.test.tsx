import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OnboardingGeneration, OnboardingView } from "@devdigest/shared";

/* SPEC-02 S14 — the tour view polls only while a generation (or indexing) runs, and
   Generate writes the running generation into the cache at once. Real QueryClient,
   fake transport. */

const get = vi.fn();
const post = vi.fn();
vi.mock("../api", () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));

import { useGenerateOnboardingTour, useOnboardingTour } from "./onboarding";

const KEY = ["onboarding", "r1"];
const generation = (status: OnboardingGeneration["status"]): OnboardingGeneration => ({
  id: "g1",
  status,
  outcome: status === "done" ? "stored" : null,
  reason: null,
  detail: null,
  started_at: "2026-10-12T10:00:00.000Z",
  finished_at: status === "running" ? null : "2026-10-12T10:01:00.000Z",
});
const view = (over: Partial<OnboardingView> = {}): OnboardingView => ({
  repo_id: "r1",
  tour: null,
  generation: null,
  clone_ready: true,
  indexing: false,
  current_commit_sha: null,
  ...over,
});

function wrapperFor(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useOnboardingTour", () => {
  it("polls while the generation runs and stops once it is done (AC-13, AC-17)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    get
      .mockResolvedValueOnce(view({ generation: generation("running") }))
      .mockResolvedValue(view({ generation: generation("done") }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useOnboardingTour("r1"), { wrapper: wrapperFor(qc) });

    await waitFor(() => expect(result.current.data?.generation?.status).toBe("running"));
    expect(get).toHaveBeenCalledWith("/repos/r1/onboarding");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    await waitFor(() => expect(result.current.data?.generation?.status).toBe("done"));
    const calls = get.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(get).toHaveBeenCalledTimes(calls);
  });
});

describe("useGenerateOnboardingTour", () => {
  it("POSTs generate and writes the running generation into the cached view (AC-12, AC-13)", async () => {
    post.mockResolvedValue(generation("running"));
    get.mockReturnValue(new Promise(() => {}));
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    qc.setQueryData(KEY, view());
    const { result } = renderHook(() => useGenerateOnboardingTour("r1"), { wrapper: wrapperFor(qc) });

    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(post).toHaveBeenCalledWith("/repos/r1/onboarding/generate");
    expect(qc.getQueryData<OnboardingView>(KEY)?.generation?.status).toBe("running");
  });
});
