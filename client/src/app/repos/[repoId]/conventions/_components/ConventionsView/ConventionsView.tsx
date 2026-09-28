/* ConventionsView — /repos/:repoId/conventions (L02 homework). The latest scan,
   the extracted candidates with accept / reject / edit, and "Create skill" from
   the accepted ones. Polls while a scan runs. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useConventions, useExtractConventions, useUpdateConvention } from "@/lib/hooks/conventions";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { DEFAULT_FILTER } from "../../constants";
import { visibleCandidates, type CandidateFilter } from "../../helpers";
import { CandidatesToolbar } from "../CandidatesToolbar";
import { ConventionCard } from "../ConventionCard";
import { CreateSkillModal } from "../CreateSkillModal";
import { ScanHeader } from "../ScanHeader";
import { s } from "./styles";

export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions");
  const { repos } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const [filter, setFilter] = React.useState<CandidateFilter>(DEFAULT_FILTER);
  const [creating, setCreating] = React.useState(false);

  const repoName = repos.find((r) => r.id === repoId)?.full_name ?? t("page.repoFallback");
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const scan = data?.scan ?? null;
  const candidates = data?.candidates ?? [];
  const accepted = candidates.filter((c) => c.status === "accepted");
  const shown = visibleCandidates(candidates, filter);
  const running = scan?.status === "running" || extract.isPending;
  const runScan = () => extract.mutate();

  let content: React.ReactNode;
  if (isLoading) {
    content = <Skeleton height={140} />;
  } else if (isError) {
    content = <ErrorState title={t("page.loadError")} onRetry={() => refetch()} />;
  } else if (!scan && candidates.length === 0) {
    content = (
      <EmptyState
        icon="ListChecks"
        title={t("page.empty.title")}
        body={t("page.empty.body")}
        cta={t("page.empty.cta")}
        onCta={runScan}
        ctaLoading={running}
      />
    );
  } else {
    content = (
      <>
        <CandidatesToolbar
          filter={filter}
          onFilter={setFilter}
          accepted={accepted.length}
          total={candidates.length}
          onCreateSkill={() => setCreating(true)}
        />
        <div style={s.list}>
          {shown.map((c) => (
            <ConventionCard
              key={c.id}
              candidate={c}
              busy={update.isPending && update.variables?.id === c.id}
              onUpdate={(patch) => update.mutate({ id: c.id, patch })}
            />
          ))}
          {shown.length === 0 && scan?.status !== "running" && (
            <div style={s.empty}>
              {candidates.length === 0 ? t("page.noneFound") : t("page.filteredEmpty")}
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <ScanHeader repoName={repoName} scan={scan} running={running} onScan={runScan} />
        {content}
      </div>
      {creating && (
        <CreateSkillModal
          repoId={repoId}
          repoFullName={repoName}
          accepted={accepted}
          onClose={() => setCreating(false)}
        />
      )}
    </AppShell>
  );
}
