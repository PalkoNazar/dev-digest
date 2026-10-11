import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BlastRadius } from "@devdigest/shared";

/* usePrBlast reads GET /pulls/:id/blast and stays idle until the PR id is known.
   Real QueryClient, fake transport. */

const get = vi.fn();
vi.mock("../api", () => ({
  api: { get: (...args: unknown[]) => get(...args) },
}));

import { usePrBlast } from "./blast";

const BLAST: BlastRadius = {
  changed_symbols: [],
  downstream: [],
  summary: "0 changed symbols",
  degraded: false,
};

function renderBlast(prId: string | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => usePrBlast(prId), { wrapper });
}

beforeEach(() => {
  get.mockReset();
});

describe("usePrBlast", () => {
  it("does not fetch while the PR id is unknown", () => {
    const { result } = renderBlast(null);
    expect(result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();
  });

  it("GETs /pulls/<id>/blast and returns the map", async () => {
    get.mockResolvedValue(BLAST);
    const { result } = renderBlast("pr-1");
    await waitFor(() => expect(result.current.data).toEqual(BLAST));
    expect(get).toHaveBeenCalledWith("/pulls/pr-1/blast");
  });
});
