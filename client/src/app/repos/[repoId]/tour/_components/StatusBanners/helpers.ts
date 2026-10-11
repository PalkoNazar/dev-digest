import type { OnboardingSkeletonReason, OnboardingView } from "@devdigest/shared";

/** The `reasons.*` message key of a skeleton reason; a missing one reads "Unknown error". */
export function reasonKey(reason: OnboardingSkeletonReason | null): OnboardingSkeletonReason | "unknown" {
  return reason ?? "unknown";
}

/** The index has moved past the commit the shown tour describes (AC-55). Unknown → not stale. */
export function isStale(view: OnboardingView): boolean {
  return !!view.tour && !!view.current_commit_sha && view.current_commit_sha !== view.tour.commit_sha;
}
