/* SkillVersions — the Versions tab: immutable body history, newest first. Each
   version expands to its body; an older one can be diffed against the current
   body or restored (the restore is saved as a new version — history is never
   rewritten). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillVersions, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { lineDiff } from "./helpers";
import { s } from "./styles";

const DIFF_SIGN = { same: " ", del: "-", add: "+" } as const;

export function SkillVersions({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const update = useUpdateSkill();
  const [open, setOpen] = React.useState<number | null>(skill.version);
  const [diffOf, setDiffOf] = React.useState<number | null>(null);

  if (isLoading) return <Skeleton height={160} />;
  if (isError) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;
  const versions = data ?? [];

  const restore = (version: number, body: string) =>
    update.mutate(
      { id: skill.id, patch: { body } },
      {
        onSuccess: (saved) => {
          toast.success(t("versions.restored", { from: version, version: saved.version }));
          setDiffOf(null);
          setOpen(saved.version);
        },
      },
    );

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("versions.title")}</h2>
      <p style={s.hint}>{t("versions.hint")}</p>
      {versions.length === 0 && <p style={s.hint}>{t("versions.empty")}</p>}
      <ul style={s.list}>
        {versions.map((v) => {
          const current = v.version === skill.version;
          const diffing = diffOf === v.version;
          const expanded = open === v.version && !diffing;
          return (
            <li key={v.version} style={s.item}>
              <div style={s.row}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => {
                    setDiffOf(null);
                    setOpen(expanded ? null : v.version);
                  }}
                  style={s.head}
                >
                  <Icon.ChevronRight size={14} style={s.chevron(expanded)} />
                  <span className="mono" style={s.version}>
                    {t("editor.version", { version: v.version })}
                  </span>
                  {current && (
                    <Badge color="var(--ok)" bg="var(--ok-bg)">
                      {t("versions.current")}
                    </Badge>
                  )}
                  <span style={s.date}>{new Date(v.created_at).toLocaleString()}</span>
                </button>
                {!current && (
                  <div style={s.actions}>
                    <Button
                      kind={diffing ? "primary" : "secondary"}
                      size="sm"
                      icon="Eye"
                      aria-pressed={diffing}
                      onClick={() => setDiffOf(diffing ? null : v.version)}
                    >
                      {t("versions.diff")}
                    </Button>
                    <Button
                      kind="secondary"
                      size="sm"
                      icon="History"
                      disabled={update.isPending || v.body === skill.body}
                      onClick={() => restore(v.version, v.body)}
                    >
                      {t("versions.restore")}
                    </Button>
                  </div>
                )}
              </div>
              {expanded && (
                <pre className="mono" style={s.body}>
                  {v.body}
                </pre>
              )}
              {diffing && (
                <div style={s.diffWrap}>
                  <div style={s.diffLegend}>
                    {t("versions.diffLegend", { from: v.version, to: skill.version })}
                  </div>
                  {v.body === skill.body ? (
                    <p style={s.diffSame}>{t("versions.diffSame")}</p>
                  ) : (
                    <pre className="mono" style={s.diff} aria-label={t("versions.diff")}>
                      {lineDiff(v.body, skill.body).map((line, i) => (
                        <div key={i} style={s.diffLine(line.kind)}>
                          {DIFF_SIGN[line.kind]} {line.text}
                        </div>
                      ))}
                    </pre>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
