/* hooks/conventions.ts — React Query hooks for the Conventions Extractor (L02
   homework): the latest scan + candidates of a repo, starting a scan, and
   accept / reject / edit of one candidate. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionScan,
  ConventionUpdate,
  ConventionsList,
} from "@devdigest/shared";

/** How often the page re-reads while a scan runs (one LLM call — tens of seconds). */
const SCAN_POLL_MS = 2000;

const key = (repoId: string | null | undefined) => ["conventions", repoId];

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: key(repoId),
    queryFn: () => api.get<ConventionsList>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
    refetchInterval: (query) =>
      query.state.data?.scan?.status === "running" ? SCAN_POLL_MS : false,
  });
}

/** Start a scan; the list then polls until it is done or failed. */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionScan>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (scan) => {
      qc.setQueryData<ConventionsList>(key(repoId), (prev) => ({
        scan,
        candidates: prev?.candidates ?? [],
      }));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key(repoId) }),
  });
}

/** Accept / reject / edit one candidate. Optimistic: the card flips at once. */
export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ConventionUpdate }) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key(repoId) });
      const previous = qc.getQueryData<ConventionsList>(key(repoId));
      if (previous) {
        qc.setQueryData<ConventionsList>(key(repoId), {
          ...previous,
          candidates: previous.candidates.map((c) =>
            c.id === id
              ? {
                  ...c,
                  ...(patch.status ? { status: patch.status } : {}),
                  ...(patch.rule && patch.rule !== c.rule ? { rule: patch.rule, edited: true } : {}),
                  ...(patch.category ? { category: patch.category } : {}),
                  ...(patch.skill_id !== undefined ? { skill_id: patch.skill_id } : {}),
                }
              : c,
          ),
        });
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      // Restore only a real snapshot; setQueryData(undefined) is a no-op anyway.
      if (ctx?.previous) qc.setQueryData(key(repoId), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key(repoId) }),
  });
}
