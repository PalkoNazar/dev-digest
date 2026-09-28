import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentSkillLink } from "@devdigest/shared";

/* useSetAgentSkillLinks is the one skills hook with logic of its own: it
   reorders the cached links before the server answers and must roll back when
   the save fails. Real QueryClient, fake transport. */

const post = vi.fn();
vi.mock("../api", () => ({ api: { post: (...args: unknown[]) => post(...args) } }));

import { useSetAgentSkillLinks } from "./skills";

const KEY = ["agent-skills", "ag1"];
const link = (skill_id: string, order: number, enabled = true): AgentSkillLink => ({
  agent_id: "ag1",
  skill_id,
  order,
  enabled,
});
const BEFORE = [link("a", 0), link("b", 1, false)];
const NEXT = [
  { skill_id: "b", enabled: false },
  { skill_id: "a", enabled: true },
];

function setup(initial: AgentSkillLink[] | undefined = BEFORE) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  if (initial) qc.setQueryData(KEY, initial);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useSetAgentSkillLinks("ag1"), { wrapper });
  return { qc, result };
}

beforeEach(() => {
  post.mockReset();
});

/** Await a save that must fail; returns its error message. */
async function failedSave(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("expected the save to fail");
}

describe("useSetAgentSkillLinks", () => {
  it("reorders the cache before the server answers", async () => {
    let resolve!: (v: AgentSkillLink[]) => void;
    post.mockReturnValue(new Promise((r) => (resolve = r)));
    const { qc, result } = setup();

    act(() => result.current.mutate(NEXT));
    await waitFor(() =>
      expect(qc.getQueryData(KEY)).toEqual([link("b", 0, false), link("a", 1)]),
    );
    expect(post).toHaveBeenCalledWith("/agents/ag1/skills", { links: NEXT });

    await act(async () => resolve([link("b", 0, false), link("a", 1)]));
  });

  it("rolls the cache back when the save fails", async () => {
    post.mockImplementation(() => Promise.reject(new Error("boom")));
    const { qc, result } = setup();

    const invalidate = vi.spyOn(qc, "invalidateQueries");

    expect(await failedSave(result.current.mutateAsync(NEXT))).toBe("boom");
    expect(qc.getQueryData(KEY)).toEqual(BEFORE);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY });
  });

  it("with nothing cached before, a failed save still drops the optimistic list", async () => {
    post.mockImplementation(() => Promise.reject(new Error("boom")));
    const { qc, result } = setup(undefined);
    const invalidate = vi.spyOn(qc, "invalidateQueries");

    expect(await failedSave(result.current.mutateAsync(NEXT))).toBe("boom");
    // the optimistic list is marked stale and re-read from the server
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY });
    expect(qc.getQueryState(KEY)?.isInvalidated).toBe(true);
  });

  it("keeps the server's answer and refreshes the agent and skill views on success", async () => {
    const saved = [link("b", 0, false), link("a", 1)];
    post.mockResolvedValue(saved);
    const { qc, result } = setup();
    const invalidate = vi.spyOn(qc, "invalidateQueries");

    act(() => result.current.mutate(NEXT));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(KEY)).toEqual(saved);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["agents"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["agent", "ag1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["skills"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["skill-stats"] });
  });
});
