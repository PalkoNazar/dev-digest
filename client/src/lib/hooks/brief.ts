/* hooks/brief.ts — React Query hooks for the PR Why + Risk Brief (L05): GET reads the
   stored brief only (never generates); POST generates one LLM brief and its response
   replaces the cache. The pending/error state lives in the MutationCache under a
   per-PR key, so it survives the Overview block unmounting on a tab switch. */
"use client";

import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "../api";
import type { PrBriefResponse } from "@devdigest/shared";

/** Root of every brief query key. */
export const BRIEF_QUERY_ROOT = ["pr-brief"] as const;

export const briefKey = (prId: string | null | undefined) => [...BRIEF_QUERY_ROOT, prId];

/** Stable per-PR mutation key: lets a remounted block see an in-flight generation. */
export const briefMutationKey = (prId: string | null | undefined) => ["pr-brief-generate", prId];

/** The stored brief (`brief: null` = none yet) and whether the PR changed since. No polling. */
export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: briefKey(prId),
    queryFn: () => api.get<PrBriefResponse>(`/pulls/${prId}/brief`),
    enabled: !!prId,
  });
}

/** Generate (or regenerate) the brief. Prefer `useBriefGeneration` in components. */
export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: briefMutationKey(prId),
    mutationFn: () => api.post<PrBriefResponse>(`/pulls/${prId}/brief`),
    // Errors are toasted by the global MutationCache handler (lib/providers.tsx).
    // Options-level callback: runs even if the block unmounted while the POST was in flight.
    onSuccess: async (data) => {
      // A GET started before the POST must not land after it and overwrite the result.
      await qc.cancelQueries({ queryKey: briefKey(prId), exact: true });
      qc.setQueryData(briefKey(prId), data);
    },
  });
}

/** Generation state for one PR, read from the MutationCache so it survives a remount. */
export function useBriefGeneration(prId: string | null | undefined) {
  const mutationKey = briefMutationKey(prId);
  const { mutate } = useGenerateBrief(prId);
  const isPending = useIsMutating({ mutationKey, exact: true }) > 0;
  const settled = useMutationState({
    filters: { mutationKey, exact: true },
    select: (m) => m.state,
  }).filter((st) => st.status === "success" || st.status === "error");
  const latest = settled[settled.length - 1];
  const error = latest?.status === "error" ? latest.error : null;
  return { generate: () => mutate(), isPending, error };
}
