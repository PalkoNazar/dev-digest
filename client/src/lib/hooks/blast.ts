/* hooks/blast.ts — React Query hook for a PR's blast radius (L04): symbols declared
   in the PR's changed files, their callers, and the endpoints/crons that may break.
   Read-only: the server builds it from the repo-intel index (no LLM, no re-parse). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadius } from "@devdigest/shared";

/** Root of every blast-radius query key. */
export const BLAST_QUERY_ROOT = ["pr-blast"] as const;

/** GET /pulls/:id/blast → the PR's blast radius (degraded/reason say why it may be incomplete). */
export function usePrBlast(prId: string | null | undefined) {
  return useQuery({
    queryKey: [...BLAST_QUERY_ROOT, prId],
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
