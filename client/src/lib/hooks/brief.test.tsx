import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrBrief, PrBriefResponse } from "@devdigest/shared";

/* PR Brief data hooks (L05 S10): GET reads the cache, POST generates and replaces it.
   Real QueryClient, fake transport (`../api`), so cache races are real. */

const get = vi.fn();
const post = vi.fn();
vi.mock("../api", () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));

import { usePrBrief, useBriefGeneration } from "./brief";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const brief = (summary: string, head_sha: string): PrBrief => ({
  summary,
  risks: { risks: [] },
  review_focus: [],
  intent: null,
  blast: null,
  history: null,
  inputs: [],
  removed: { risks: 0, file_refs: 0, review_focus: 0 },
  run: {
    provider: "openrouter",
    model: "m",
    tokens_in: 100,
    tokens_out: 20,
    cost_usd: null,
    duration_ms: 1200,
    est_input_tokens: 90,
    head_sha,
    generated_at: "2026-10-20T10:00:00Z",
  },
});

const OLD: PrBriefResponse = { brief: brief("old summary", "aaa1111"), stale: false };
const FRESH: PrBriefResponse = { brief: brief("fresh summary", "bbb2222"), stale: false };
const EMPTY: PrBriefResponse = { brief: null, stale: false };

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapperFor(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

/** The Overview block reads both hooks; mount them together like it does. */
function renderBlock(qc: QueryClient, prId: string) {
  return renderHook(() => ({ q: usePrBrief(prId), g: useBriefGeneration(prId) }), {
    wrapper: wrapperFor(qc),
  });
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : e);

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe("usePrBrief / useBriefGeneration", () => {
  it("mount reads the stored brief with a GET and never POSTs", async () => {
    get.mockResolvedValue(OLD);
    const { result } = renderBlock(makeClient(), "pr-1");
    await waitFor(() => expect(result.current.q.data).toEqual(OLD));
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/pulls/pr-1/brief");
    expect(post).not.toHaveBeenCalled();
    expect(result.current.g.isPending).toBe(false);
    expect(result.current.g.error).toBeFalsy();
  });

  it("does not fetch while the PR id is unknown", () => {
    const { result } = renderHook(() => usePrBrief(null), { wrapper: wrapperFor(makeClient()) });
    expect(result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();
  });

  it("generate() POSTs and the POST response replaces the cached brief", async () => {
    get.mockResolvedValue(OLD);
    post.mockResolvedValue(FRESH);
    const { result } = renderBlock(makeClient(), "pr-1");
    await waitFor(() => expect(result.current.q.data).toEqual(OLD));

    act(() => {
      result.current.g.generate();
    });

    await waitFor(() => expect(result.current.q.data).toEqual(FRESH));
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[0]).toBe("/pulls/pr-1/brief");
    // The POST result is the cache — no extra GET round-trip.
    expect(get).toHaveBeenCalledTimes(1);
    expect(result.current.g.isPending).toBe(false);
  });

  it("a GET that started before the POST and resolves after it does not overwrite the POST result", async () => {
    const lateGet = deferred<PrBriefResponse>();
    get.mockReturnValue(lateGet.promise);
    post.mockResolvedValue(FRESH);
    const { result } = renderBlock(makeClient(), "pr-1");
    expect(get).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.g.generate();
    });
    await waitFor(() => expect(result.current.q.data).toEqual(FRESH));

    // The GET issued on mount lands only now, with the older brief.
    await act(async () => {
      lateGet.resolve(OLD);
      await lateGet.promise;
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.q.data).toEqual(FRESH);
  });

  it("unmount during a pending POST, remount → still pending, then the cache holds the POST result", async () => {
    const qc = makeClient();
    get.mockResolvedValue(EMPTY);
    const slowPost = deferred<PrBriefResponse>();
    post.mockReturnValue(slowPost.promise);

    const first = renderBlock(qc, "pr-1");
    await waitFor(() => expect(first.result.current.q.data).toEqual(EMPTY));
    act(() => {
      first.result.current.g.generate();
    });
    await waitFor(() => expect(first.result.current.g.isPending).toBe(true));
    // Tab switch: the Overview block unmounts while the request is in flight.
    first.unmount();

    const second = renderBlock(qc, "pr-1");
    expect(second.result.current.g.isPending).toBe(true);
    // Pending state is per PR: another PR's block is not disabled.
    const other = renderHook(() => useBriefGeneration("pr-2"), { wrapper: wrapperFor(qc) });
    expect(other.result.current.isPending).toBe(false);

    await act(async () => {
      slowPost.resolve(FRESH);
      await slowPost.promise;
    });

    await waitFor(() => expect(second.result.current.g.isPending).toBe(false));
    await waitFor(() => expect(second.result.current.q.data).toEqual(FRESH));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("a failed generation's error survives a remount; a successful retry clears it", async () => {
    const qc = makeClient();
    get.mockResolvedValue(OLD);
    post.mockRejectedValueOnce(new Error("Brief generation timed out"));

    const first = renderBlock(qc, "pr-1");
    await waitFor(() => expect(first.result.current.q.data).toEqual(OLD));
    act(() => {
      first.result.current.g.generate();
    });
    await waitFor(() =>
      expect(errorMessage(first.result.current.g.error)).toBe("Brief generation timed out"),
    );
    first.unmount();

    const second = renderBlock(qc, "pr-1");
    expect(errorMessage(second.result.current.g.error)).toBe("Brief generation timed out");
    expect(second.result.current.g.isPending).toBe(false);
    // The previous brief stays in the cache after the failure.
    await waitFor(() => expect(second.result.current.q.data).toEqual(OLD));

    post.mockResolvedValueOnce(FRESH);
    act(() => {
      second.result.current.g.generate();
    });
    await waitFor(() => expect(second.result.current.q.data).toEqual(FRESH));
    await waitFor(() => expect(second.result.current.g.error).toBeFalsy());
  });
});
