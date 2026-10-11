/* SkillContextTab — the skill's Project context documents for the active repo (L05):
   "N attached" (AC-22), the shared document list, "≈ T tokens" (AC-24) and the
   "Serializes as" preview (AC-25). Agents that use the skill inherit these documents. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { ContextDocsPanel, ownPaths } from "@/components/context-docs";
import { useSetSkillContext, useSkillContext } from "@/lib/hooks/context";
import { useActiveRepo } from "@/lib/repo-context";
import { serializesAs } from "./helpers";
import { s } from "./styles";

export function SkillContextTab({ skillId }: { skillId: string }) {
  const t = useTranslations("context");
  const { activeRepo } = useActiveRepo();
  if (!activeRepo) return <EmptyState icon="GitBranch" title={t("tab.noRepo")} />;
  return <SkillContext skillId={skillId} repoId={activeRepo.id} />;
}

function SkillContext({ skillId, repoId }: { skillId: string; repoId: string }) {
  const t = useTranslations("context");
  const { data: view, isLoading, isError, refetch } = useSkillContext(skillId, repoId);
  const save = useSetSkillContext(skillId, repoId);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={220} />
        <Skeleton height={180} />
      </div>
    );
  }
  if (isError || !view) return <ErrorState title={t("tab.loadError")} onRetry={() => refetch()} />;

  return (
    <div style={s.wrap}>
      <ContextDocsPanel
        repoId={repoId}
        view={view}
        pending={save.isPending}
        onChange={(paths) => save.mutate(paths)}
        heading={
          <>
            <h2 style={s.h2}>{t("skillTab.title")}</h2>
            <Badge color="var(--accent-text)" bg="var(--accent-bg)">
              {t("skillTab.count", { count: view.attached })}
            </Badge>
          </>
        }
        hint={t("skillTab.hint")}
      />
      <span className="mono" style={s.tokens}>
        {t("tab.tokens", { tokens: view.tokens })}
      </span>
      <h3 style={s.label}>{t("skillTab.serializesAs")}</h3>
      <pre className="mono" style={s.serialized}>
        {serializesAs(ownPaths(view.rows))}
      </pre>
    </div>
  );
}
