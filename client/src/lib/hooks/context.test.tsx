import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContextAttachments } from "@devdigest/shared";

/* L05 S8 — useSetAgentContext is not optimistic (plan R3): it PUTs the whole
   ordered path list and the agent's Context view shows the server's answer;
   a failed save leaves the cached view as it was (AC-45). Real QueryClient,
   fake transport. The view is read through useAgentContext, so the test does
   not depend on the query key the hook file picks. */

const get = vi.fn();
const put = vi.fn();
vi.mock("../api", () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    put: (...args: unknown[]) => put(...args),
  },
}));

import { useAgentContext, useSetAgentContext } from "./context";

const REPO = "11111111-1111-4111-8111-111111111111";

const BEFORE: ContextAttachments = {
  repo_id: REPO,
  rows: [
    { path: "specs/a.md", category: "specs", tokens: 120, state: "attached", via: [] },
    { path: "docs/b.md", category: "docs", tokens: 80, state: "available", via: [] },
  ],
  attached: 1,
  total: 2,
  tokens: 120,
};

const AFTER: ContextAttachments = {
  repo_id: REPO,
  rows: [
    { path: "specs/a.md", category: "specs", tokens: 120, state: "attached", via: [] },
    { path: "docs/b.md", category: "docs", tokens: 80, state: "attached", via: [] },
  ],
  attached: 2,
  total: 2,
  tokens: 200,
};

const NEXT_PATHS = ["specs/a.md", "docs/b.md"];

async function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => ({ view: useAgentContext("ag1", REPO), save: useSetAgentContext("ag1", REPO) }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.view.data).toEqual(BEFORE));
  return { qc, result };
}

beforeEach(() => {
  get.mockReset();
  put.mockReset();
  // The server's stored view never changes here: if the view ever shows AFTER,
  // it came from the PUT response, not from a refetch.
  get.mockResolvedValue(BEFORE);
});

describe("useSetAgentContext", () => {
  it("PUTs { repo_id, paths } and shows the server's answer in the agent's view", async () => {
    put.mockResolvedValue(AFTER);
    const { result } = await setup();

    act(() => result.current.save.mutate(NEXT_PATHS));

    await waitFor(() => expect(result.current.save.isSuccess).toBe(true));
    expect(put).toHaveBeenCalledWith("/agents/ag1/context", { repo_id: REPO, paths: NEXT_PATHS });
    await waitFor(() => expect(result.current.view.data).toEqual(AFTER));
  });

  it("leaves the cached view unchanged when the PUT is rejected (AC-45)", async () => {
    put.mockImplementation(() => Promise.reject(new Error("boom")));
    const { result } = await setup();

    let message = "";
    await act(async () => {
      try {
        await result.current.save.mutateAsync(NEXT_PATHS);
      } catch (e) {
        message = (e as Error).message;
      }
    });

    expect(message).toBe("boom");
    expect(result.current.view.data).toEqual(BEFORE);
  });
});
