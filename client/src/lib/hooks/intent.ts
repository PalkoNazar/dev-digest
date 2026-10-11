/* hooks/intent.ts — React Query hooks for the PR Intent Layer: the stored intent
   of a PR (summary, in/out of scope, confidence, sources) and a forced re-derive. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentResponse } from "@devdigest/shared";

/** Root of every intent query key — invalidated when a run emits `intent_ready`. */
export const INTENT_QUERY_ROOT = ["pr-intent"] as const;

/** How often the intent is re-read while a run may still be deriving it. */
const INTENT_POLL_MS = 3000;

const key = (prId: string | null | undefined) => [...INTENT_QUERY_ROOT, prId];

export interface UsePrIntentOptions {
  /** A review run is active: re-read every few seconds while the intent is missing or stale. */
  poll?: boolean;
}

/** The PR's stored intent (`intent: null` = not derived yet) and whether the PR changed since. */
export function usePrIntent(prId: string | null | undefined, opts: UsePrIntentOptions = {}) {
  return useQuery({
    queryKey: key(prId),
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
    refetchOnMount: "always",
    refetchInterval: (query) => {
      const data = query.state.data;
      const waiting = !data?.intent || data.stale;
      return opts.poll && waiting ? INTENT_POLL_MS : false;
    },
  });
}

/** Force a re-derive (synchronous classifier call on the server, bounded at 30 s). */
export function useDeriveIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentResponse>(`/pulls/${prId}/intent`),
    // Errors are toasted by the global MutationCache handler (lib/providers.tsx).
    onSuccess: (data) => qc.setQueryData(key(prId), data),
  });
}
