/* SkillsTab — the agent's attached skills (L02): attach / detach, enable or
   disable per agent, reorder (drag or ↑/↓). Order = order of the blocks in the
   prompt. Every change saves at once (optimistic) as the full ordered set. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Checkbox,
  Dropdown,
  ErrorState,
  Icon,
  IconBtn,
  Skeleton,
} from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkillLinks, useSetAgentSkillLinks, useSkills } from "@/lib/hooks/skills";
import { SKILL_TYPE_COLOR } from "@/lib/skill-types";
import { countEffective, matchesFilter, moveItem, toRows, type SkillRow } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const tSkills = useTranslations("skills");
  const skillsQ = useSkills();
  const linksQ = useAgentSkillLinks(agent.id);
  const setLinks = useSetAgentSkillLinks(agent.id);
  const [filter, setFilter] = React.useState("");
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);

  if (skillsQ.isLoading || linksQ.isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={200} />
        <Skeleton height={180} />
      </div>
    );
  }
  if (skillsQ.isError || linksQ.isError) {
    return (
      <ErrorState
        body={t("skills.loadError")}
        onRetry={() => {
          void skillsQ.refetch();
          void linksQ.refetch();
        }}
      />
    );
  }

  const skills = skillsQ.data ?? [];
  const rows = toRows(linksQ.data ?? [], skills);
  const attached = new Set(rows.map((r) => r.skill.id));
  const available = skills.filter((sk) => !attached.has(sk.id));

  const save = (next: SkillRow[]) =>
    setLinks.mutate(next.map((r) => ({ skill_id: r.skill.id, enabled: r.enabled })));
  const toggle = (i: number, enabled: boolean) =>
    save(rows.map((r, j) => (j === i ? { ...r, enabled } : r)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    save(moveItem(rows, from, to));
  };
  const detach = (i: number) => save(rows.filter((_, j) => j !== i));
  const attach = (id: string) => {
    const skill = skills.find((sk) => sk.id === id);
    if (skill) save([...rows, { skill, enabled: true }]);
  };

  const visible = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => matchesFilter(row.skill, filter));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { enabled: countEffective(rows), total: rows.length })}
        </Badge>
        <div style={s.filter}>
          <Icon.Search size={13} style={s.muted} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
        <Dropdown
          width={260}
          align="right"
          trigger={
            <Button kind="secondary" size="sm" icon="Plus" iconRight="ChevronDown">
              {t("skills.attach")}
            </Button>
          }
          items={
            available.length > 0
              ? available.map((sk) => ({
                  label: sk.name,
                  icon: "Sparkles" as const,
                  hint: tSkills(`type.${sk.type}`),
                  onClick: () => attach(sk.id),
                }))
              : [{ label: t("skills.attachEmpty"), muted: true }]
          }
        />
      </div>
      <p style={s.hint}>{t("skills.hint")}</p>

      {skills.length === 0 ? (
        <div style={s.empty}>
          {t("skills.noSkills")}{" "}
          <Link href="/skills/new" style={s.link}>
            {t("skills.createFirst")}
          </Link>
        </div>
      ) : rows.length === 0 ? (
        <div style={s.empty}>{t("skills.empty")}</div>
      ) : visible.length === 0 ? (
        <div style={s.empty}>{t("skills.noMatch", { query: filter })}</div>
      ) : (
        <ul style={s.list}>
          {visible.map(({ row, index }) => {
            const color = SKILL_TYPE_COLOR[row.skill.type];
            const name = row.skill.name;
            return (
              <li
                key={row.skill.id}
                draggable
                onDragStart={() => setDragFrom(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragFrom !== null) move(dragFrom, index);
                  setDragFrom(null);
                }}
                onDragEnd={() => setDragFrom(null)}
                style={s.row(dragFrom === index, row.enabled && row.skill.enabled)}
              >
                <span style={s.handle} title={t("skills.dragHandle", { name })} aria-hidden>
                  <Icon.Menu size={14} />
                </span>
                <Checkbox
                  checked={row.enabled}
                  onChange={(v) => toggle(index, v)}
                  label={
                    <span className="mono" style={s.name} title={row.skill.description}>
                      {name}
                    </span>
                  }
                />
                {!row.skill.enabled && (
                  <span title={t("skills.disabledGloballyTitle")}>
                    <Badge color="var(--warn)" bg="var(--warn-bg)">
                      {t("skills.disabledGlobally")}
                    </Badge>
                  </span>
                )}
                <span style={s.rowRight}>
                  <Badge color={color.fg} bg={color.bg}>
                    {tSkills(`type.${row.skill.type}`)}
                  </Badge>
                  <IconBtn
                    icon="ArrowUp"
                    size={26}
                    label={t("skills.moveUp", { name })}
                    onClick={() => move(index, index - 1)}
                  />
                  <IconBtn
                    icon="ArrowDown"
                    size={26}
                    label={t("skills.moveDown", { name })}
                    onClick={() => move(index, index + 1)}
                  />
                  <IconBtn
                    icon="X"
                    size={26}
                    label={t("skills.detach", { name })}
                    onClick={() => detach(index)}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/skills" style={s.manage}>
        {t("skills.manage")} →
      </Link>
    </div>
  );
}
