/* OnboardingTourView — /repos/:repoId/tour (L05, SPEC-02). The repo's stored onboarding
   tour: five sections in a fixed order with an On this page list, the header meta and the
   status banners; Generate / Regenerate start a background generation and the page polls
   while it runs. Reading the page never starts a generation (AC-32, AC-56). */
"use client";

import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { ONBOARDING_SECTION_IDS, type OnboardingSectionId, type OnboardingTour } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useRefreshRepo } from "@/lib/hooks/core";
import { useGenerateOnboardingTour, useOnboardingTour } from "@/lib/hooks/onboarding";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ArchitectureSection } from "../ArchitectureSection";
import { CriticalPathsSection } from "../CriticalPathsSection";
import { FirstTasksSection } from "../FirstTasksSection";
import { OnThisPage } from "../OnThisPage";
import { ReadingPathSection } from "../ReadingPathSection";
import { RunLocallySection } from "../RunLocallySection";
import { StatusBanners } from "../StatusBanners";
import { TourHeader } from "../TourHeader";
import { TourSection } from "../TourSection";
import { TourAction } from "./_components/TourAction";
import { tourActionState } from "./helpers";
import { s } from "./styles";

function SectionBody({ id, tour }: { id: OnboardingSectionId; tour: OnboardingTour }) {
  const { sections } = tour;
  switch (id) {
    case "architecture":
      return <ArchitectureSection section={sections.architecture} />;
    case "critical_paths":
      return <CriticalPathsSection section={sections.critical_paths} />;
    case "run_locally":
      return <RunLocallySection section={sections.run_locally} />;
    case "reading_path":
      return <ReadingPathSection section={sections.reading_path} />;
    case "first_tasks":
      return <FirstTasksSection section={sections.first_tasks} />;
  }
}

export function OnboardingTourView({ repoId }: { repoId: string }) {
  const t = useTranslations("onboarding");
  const { repos } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: view, isError, refetch } = useOnboardingTour(repoId);
  const generate = useGenerateOnboardingTour(repoId);
  const refreshRepo = useRefreshRepo();

  const fullName = repos.find((r) => r.id === repoId)?.full_name;
  const crumb = [...(fullName ? [{ label: fullName }] : []), { label: t("page.crumb") }];
  // The design titles the page with the repo name only ("Onboarding for payments-api").
  const repoName = fullName?.split("/").pop() ?? t("page.repoFallback");

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  // A failed background refetch keeps the cached tour on screen (AC-15); the error state is
  // only for a view that never loaded (AC-10).
  if (!view) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <TourHeader repoName={repoName} tour={null} />
          {isError ? (
            <ErrorState title={t("page.loadError")} onRetry={() => void refetch()} />
          ) : (
            <div aria-busy="true" style={s.loading}>
              <Skeleton height={20} width="40%" />
              <Skeleton height={180} />
              <Skeleton height={140} />
            </div>
          )}
        </div>
      </AppShell>
    );
  }

  const tour = view.tour;
  const actionState = tourActionState(view, generate.isPending);
  const startGeneration = () => generate.mutate();
  const action = (
    <TourAction
      state={actionState}
      hasTour={!!tour}
      onGenerate={startGeneration}
      // useRefreshRepo doesn't invalidate this view; re-read it so `indexing` arrives and polling starts.
      onResync={() => refreshRepo.mutate(repoId, { onSettled: () => void refetch() })}
      resyncing={refreshRepo.isPending}
    />
  );
  const banners = (
    <StatusBanners view={view} onRegenerate={startGeneration} regenerateDisabled={actionState !== "ready"} />
  );

  if (!tour) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <TourHeader repoName={repoName} tour={null} />
          {banners}
          <div style={s.empty}>
            <EmptyState
              icon="Boxes"
              title={t("empty.title")}
              body={
                <>
                  {t("empty.body")}
                  <ul style={s.emptyList}>
                    {ONBOARDING_SECTION_IDS.map((id) => (
                      <li key={id}>{t(`sections.${id}`)}</li>
                    ))}
                  </ul>
                </>
              }
            />
            {action}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.layout}>
        <OnThisPage />
        <div style={s.main}>
          <TourHeader repoName={repoName} tour={tour} action={action} />
          {banners}
          {ONBOARDING_SECTION_IDS.map((id) => (
            <TourSection key={id} id={id}>
              <SectionBody id={id} tour={tour} />
            </TourSection>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
