/* ContextTab — the agent's Project context documents for the active repo (L05):
   "K of M attached" (AC-12), the shared document list with inherited skill documents,
   and "≈ T tokens" the next run would inject (AC-17). Every change saves at once as
   the whole ordered list; the list shows the server's answer (not optimistic). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ContextDocsPanel } from "@/components/context-docs";
import { useAgentContext, useSetAgentContext } from "@/lib/hooks/context";
import { useActiveRepo } from "@/lib/repo-context";
import { s } from "./styles";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("context");
  const { activeRepo } = useActiveRepo();
  if (!activeRepo) return <EmptyState icon="GitBranch" title={t("tab.noRepo")} />;
  return <AgentContext agentId={agent.id} repoId={activeRepo.id} />;
}

function AgentContext({ agentId, repoId }: { agentId: string; repoId: string }) {
  const t = useTranslations("context");
  const { data: view, isLoading, isError, refetch } = useAgentContext(agentId, repoId);
  const save = useSetAgentContext(agentId, repoId);

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
            <h2 style={s.h2}>{t("agentTab.title")}</h2>
            <Badge color="var(--accent-text)" bg="var(--accent-bg)">
              {t("agentTab.count", { attached: view.attached, total: view.total })}
            </Badge>
          </>
        }
        hint={t("agentTab.hint")}
      />
      <div style={s.footer}>
        <span className="mono">{t("tab.tokens", { tokens: view.tokens })}</span>
        <span style={s.note}>{t("tab.untrustedNote")}</span>
      </div>
    </div>
  );
}
