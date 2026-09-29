/* SkillDetail — right pane of /skills/:id: header (name, type, version, vetting
   badge) + tabs Config (editor) / Preview (rendered skill) / Versions (history).
   Tab lives in ?tab=. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Icon, Markdown, Skeleton, Tabs } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useSkill } from "@/lib/hooks/skills";
import { SKILL_TYPE_COLOR } from "@/lib/skill-types";
import { SkillDeleteDialog } from "../SkillDeleteDialog";
import { SkillEditor } from "../SkillEditor";
import { SkillStatsTab } from "../SkillStatsTab";
import { SkillVersions } from "../SkillVersions";
import { DETAIL_TABS } from "./constants";
import { s } from "./styles";

export function SkillDetail({ id, tab }: { id: string; tab: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const [deleting, setDeleting] = React.useState(false);
  const active = DETAIL_TABS.some((d) => d.key === tab) ? tab : "config";

  if (isLoading) {
    return (
      <div style={s.loading}>
        <Skeleton height={24} width={260} />
        <Skeleton height={320} />
      </div>
    );
  }
  if (isError && error instanceof ApiError && error.status === 404) {
    return (
      <div style={s.center}>
        <EmptyState icon="Sparkles" title={t("detail.notFoundTitle")} body={t("detail.notFoundBody")} />
      </div>
    );
  }
  if (isError || !skill) return <ErrorState body={t("detail.loadError")} onRetry={() => refetch()} />;

  const color = SKILL_TYPE_COLOR[skill.type];
  const needsVetting = skill.source !== "manual" && !skill.enabled;
  const tabs = DETAIL_TABS.map((d) => ({ key: d.key, label: t(d.labelKey), icon: d.icon }));

  return (
    <>
      {deleting && (
        <SkillDeleteDialog
          skill={skill}
          onClose={() => setDeleting(false)}
          onDeleted={() => router.push("/skills")}
        />
      )}
      <div style={s.header}>
        <Icon.Sparkles size={18} style={s.icon} />
        <h1 className="mono" style={s.h1}>
          {skill.name}
        </h1>
        <Badge color={color.fg} bg={color.bg}>
          {t(`type.${skill.type}`)}
        </Badge>
        <Badge mono icon="GitCommit">
          {t("editor.version", { version: skill.version })}
        </Badge>
        {needsVetting && (
          <span title={t("detail.needsVettingTitle")}>
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("detail.needsVetting")}
            </Badge>
          </span>
        )}
      </div>
      <div style={s.tabsBar}>
        <Tabs
          tabs={tabs}
          value={active}
          onChange={(k) => router.replace(`/skills/${skill.id}?tab=${k}`)}
          pad="0 28px"
        />
      </div>
      <div style={s.body}>
        {active === "config" && <SkillEditor skill={skill} onDelete={() => setDeleting(true)} />}
        {active === "preview" && (
          <div style={s.preview}>
            {skill.source !== "manual" && (
              <div style={s.notice}>
                <Icon.AlertTriangle size={14} style={s.noticeIcon} />
                <span>{t("preview.importedNotice")}</span>
              </div>
            )}
            <h3 style={s.label}>{t("preview.description")}</h3>
            <p style={s.description}>{skill.description}</p>
            <div style={s.markdown}>
              <Markdown>{skill.body}</Markdown>
            </div>
          </div>
        )}
        {active === "stats" && <SkillStatsTab skillId={skill.id} />}
        {active === "versions" && <SkillVersions skill={skill} />}
      </div>
    </>
  );
}
