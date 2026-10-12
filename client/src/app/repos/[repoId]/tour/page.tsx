"use client";

import { useParams } from "next/navigation";
import { OnboardingTourView } from "./_components/OnboardingTourView";

/* Route: /repos/:repoId/tour (L05, SPEC-02 — Onboarding Tour). */
export default function OnboardingTourPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <OnboardingTourView repoId={repoId} />;
}
