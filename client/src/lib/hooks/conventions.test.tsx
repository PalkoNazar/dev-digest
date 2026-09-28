import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ConventionCandidate, ConventionsList } from "@devdigest/shared";

/* useUpdateConvention flips the cached card before the server answers and must
   roll back when the save fails. Real QueryClient, fake transport. */

const patch = vi.fn();
const get = vi.fn();
vi.mock("../api", () => ({
  api: {
    patch: (...args: unknown[]) => patch(...args),
    get: (...args: unknown[]) => get(...args),
  },
}));

import { useUpdateConvention } from "./conventions";

const KEY = ["conventions", "r1"];
const candidate = (id: string, over: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id,
  category: "naming",
  rule: `Rule ${id}`,
  evidence: [],
  confidence: 0.8,
  status: "pending",
  edited: false,
  created_at: "",
  ...over,
});
const BEFORE: ConventionsList = { scan: null, candidates: [candidate("a"), candidate("b")] };

function setup() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  qc.setQueryData(KEY, BEFORE);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useUpdateConvention("r1"), { wrapper });
  return { qc, result };
}

const cached = (qc: QueryClient, id: string) =>
  qc.getQueryData<ConventionsList>(KEY)?.candidates.find((c) => c.id === id);

beforeEach(() => {
  patch.mockReset();
  get.mockReset();
  // the refetch after settling returns what is cached, so assertions see the optimistic state
  get.mockImplementation(() => new Promise(() => {}));
});

describe("useUpdateConvention", () => {
  it("patches only the target card before the server answers", async () => {
    patch.mockReturnValue(new Promise(() => {}));
    const { qc, result } = setup();
    act(() => result.current.mutate({ id: "a", patch: { status: "accepted" } }));
    await waitFor(() => expect(cached(qc, "a")?.status).toBe("accepted"));
    expect(cached(qc, "b")?.status).toBe("pending");
    expect(patch).toHaveBeenCalledWith("/conventions/a", { status: "accepted" });
  });

  it("marks a changed rule edited and records the skill optimistically", async () => {
    patch.mockReturnValue(new Promise(() => {}));
    const { qc, result } = setup();
    act(() => result.current.mutate({ id: "a", patch: { rule: "New rule" } }));
    await waitFor(() => expect(cached(qc, "a")).toMatchObject({ rule: "New rule", edited: true }));
    act(() => result.current.mutate({ id: "b", patch: { skill_id: "s1" } }));
    await waitFor(() => expect(cached(qc, "b")?.skill_id).toBe("s1"));
    expect(cached(qc, "b")?.edited).toBe(false);
  });

  it("restores the previous list when the save fails", async () => {
    patch.mockRejectedValue(new Error("boom"));
    const { qc, result } = setup();
    await act(async () => {
      await result.current.mutateAsync({ id: "a", patch: { status: "rejected" } }).catch(() => undefined);
    });
    expect(cached(qc, "a")?.status).toBe("pending");
  });
});
