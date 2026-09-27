/* SkillVersions — the Versions tab: immutable body history, newest first. Each
   version expands to its body; the current one is marked. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillVersions } from "@/lib/hooks/skills";
import { s } from "./styles";

export function SkillVersions({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const [open, setOpen] = React.useState<number | null>(skill.version);

  if (isLoading) return <Skeleton height={160} />;
  if (isError) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;
  const versions = data ?? [];

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("versions.title")}</h2>
      <p style={s.hint}>{t("versions.hint")}</p>
      {versions.length === 0 && <p style={s.hint}>{t("versions.empty")}</p>}
      <ul style={s.list}>
        {versions.map((v) => {
          const expanded = open === v.version;
          return (
            <li key={v.version} style={s.item}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : v.version)}
                style={s.head}
              >
                <Icon.ChevronRight size={14} style={s.chevron(expanded)} />
                <span className="mono" style={s.version}>
                  {t("editor.version", { version: v.version })}
                </span>
                {v.version === skill.version && (
                  <Badge color="var(--ok)" bg="var(--ok-bg)">
                    {t("versions.current")}
                  </Badge>
                )}
                <span style={s.date}>{new Date(v.created_at).toLocaleString()}</span>
              </button>
              {expanded && (
                <pre className="mono" style={s.body}>
                  {v.body}
                </pre>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
