/* hooks/onboarding.ts — React Query hooks for the Onboarding Tour (SPEC-02, L05):
     GET  /repos/:id/onboarding           → OnboardingView (stored tour + latest generation)
     POST /repos/:id/onboarding/generate  → 202 OnboardingGeneration (409 while one runs)
   Reading the view never starts a generation (AC-32, AC-56); the page polls while a
   generation or the clone/index job runs. Failures toast via the global MutationCache. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { OnboardingGeneration, OnboardingView } from "@devdigest/shared";

/** How often the page re-reads while a generation or indexing runs (AC-13, AC-17). */
const TOUR_POLL_MS = 2000;

const key = (repoId: string | null | undefined) => ["onboarding", repoId];

/** Whether the view is still changing on the server (a generation or the index job runs). */
function onboardingIsBusy(view: OnboardingView | undefined): boolean {
  return view?.generation?.status === "running" || view?.indexing === true;
}

export function useOnboardingTour(repoId: string | null | undefined) {
  return useQuery({
    queryKey: key(repoId),
    queryFn: () => api.get<OnboardingView>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
    refetchInterval: (query) => (onboardingIsBusy(query.state.data) ? TOUR_POLL_MS : false),
  });
}

/** Start a generation; the cached view shows it as running at once, then polls. */
export function useGenerateOnboardingTour(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<OnboardingGeneration>(`/repos/${repoId}/onboarding/generate`),
    onSuccess: (generation) => {
      qc.setQueryData<OnboardingView>(key(repoId), (prev) => (prev ? { ...prev, generation } : prev));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key(repoId) }),
  });
}
