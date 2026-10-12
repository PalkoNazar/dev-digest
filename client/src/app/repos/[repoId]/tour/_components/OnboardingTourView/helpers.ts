import type { OnboardingView } from "@devdigest/shared";

/** What the generation control offers right now. */
export type TourActionState = "resync" | "running" | "blocked" | "ready";

/**
 * A generation running or being requested → "Generating…" (AC-13); the clone or index job
 * running → disabled, also while the first clone is still missing (AC-52); no clone and
 * nothing running → Resync instead of Generate (AC-84); else ready.
 */
export function tourActionState(view: OnboardingView, requestPending: boolean): TourActionState {
  if (requestPending || view.generation?.status === "running") return "running";
  if (view.indexing) return "blocked";
  if (!view.clone_ready) return "resync";
  return "ready";
}
