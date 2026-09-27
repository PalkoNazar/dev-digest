/* SkillStatsTab — the skill's Stats tab (mockup "Skills Lab › Skills › Stats"):
   KPI tiles (used by, pull frequency, accept rate, findings), the agents using
   the skill, and findings by category. All numbers come from recorded runs. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, CircularScore, Donut, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { useSkillStats } from "@/lib/hooks/skills";
import { CATEGORY_COLOR, FALLBACK_CATEGORY_COLOR } from "./constants";
import { toPercent } from "./helpers";
import { s } from "./styles";

export function SkillStatsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skillId);

  if (isLoading) return <Skeleton height={220} />;
  if (isError || !stats) return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;

  const pull = toPercent(stats.pull_rate);
  const accept = toPercent(stats.accept_rate);
  const noData = t("stats.noData");

  return (
    <div style={s.wrap}>
      <div style={s.tiles}>
        <Tile label={t("stats.usedBy")}>
          <span style={s.big}>{stats.agents.length}</span>
          <span style={s.unit}>{t("stats.agentsUnit", { count: stats.agents.length })}</span>
        </Tile>
        <Tile
          label={t("stats.pullFrequency")}
          hint={t("stats.pullHint", { pulled: stats.runs_with_skill, total: stats.runs_total })}
        >
          <span style={s.big}>{pull ?? noData}</span>
          {pull != null && <span style={s.unit}>%</span>}
        </Tile>
        <Tile
          label={t("stats.acceptRate")}
          hint={t("stats.acceptHint", { accepted: stats.accepted, dismissed: stats.dismissed })}
          right={accept != null ? <CircularScore score={accept} size={34} stroke={3} /> : undefined}
        >
          <span style={s.big}>{accept ?? noData}</span>
          {accept != null && <span style={s.unit}>%</span>}
        </Tile>
        <Tile
          label={t("stats.findings", { days: stats.window_days })}
          hint={t("stats.findingsHint")}
        >
          <span style={s.big}>{stats.findings}</span>
        </Tile>
      </div>

      <div style={s.panels}>
        <section style={s.panel}>
          <h3 style={s.panelTitle}>
            <Icon.Cpu size={13} /> {t("stats.agentsTitle")}
          </h3>
          {stats.agents.length === 0 ? (
            <p style={s.muted}>{t("stats.noAgents")}</p>
          ) : (
            <ul style={s.agentList}>
              {stats.agents.map((a) => (
                <li key={a.id} style={s.agentRow}>
                  <Icon.Cpu size={14} style={s.agentIcon} />
                  <span style={s.agentName}>{a.name}</span>
                  {!a.link_enabled && <Badge color="var(--warn)">{t("stats.offForAgent")}</Badge>}
                  {!a.agent_enabled && (
                    <Badge color="var(--text-muted)">{t("stats.agentDisabled")}</Badge>
                  )}
                  <Link href={`/agents/${a.id}?tab=skills`} style={s.open}>
                    {t("stats.open")}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section style={s.panel}>
          <h3 style={s.panelTitle}>
            <Icon.Tag size={13} /> {t("stats.byCategoryTitle")}
          </h3>
          {stats.by_category.length === 0 ? (
            <p style={s.muted}>{t("stats.noFindings")}</p>
          ) : (
            <Donut
              segments={stats.by_category.map((c) => ({
                label: c.category,
                value: c.count,
                color: CATEGORY_COLOR[c.category] ?? FALLBACK_CATEGORY_COLOR,
              }))}
              format={(v) => String(v)}
            />
          )}
        </section>
      </div>
      <p style={s.footnote}>{t("stats.footnote", { days: stats.window_days })}</p>
    </div>
  );
}

function Tile({
  label,
  hint,
  right,
  children,
}: {
  label: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={s.tile} title={hint}>
      <div style={s.tileHead}>
        <span style={s.tileLabel}>{label}</span>
        {right}
      </div>
      <div style={s.tileValue}>{children}</div>
      {hint && <div style={s.tileHint}>{hint}</div>}
    </div>
  );
}
