/* SkillsTab — every workspace skill for this agent (L02): the attached ones first,
   in prompt order, then the rest. A checkbox enables a skill for the agent
   (attaching it at the end if needed); only enabled skills can be reordered (drag
   or ↑/↓) — order = order of the blocks in the prompt. Every change saves at once
   (optimistic) as the full ordered set. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, ErrorState, Icon, IconBtn, Skeleton } from "@devdigest/ui";
import type { Agent, Skill } from "@devdigest/shared";
import { useAgentSkillLinks, useSetAgentSkillLinks, useSkills } from "@/lib/hooks/skills";
import { SKILL_TYPE_COLOR } from "@/lib/skill-types";
import {
  countEffective,
  enabledNeighbour,
  matchesFilter,
  moveItem,
  toRows,
  unattachedSkills,
  type SkillRow,
} from "./helpers";
import { s } from "./styles";

/** A list entry: an attached row (`index` into the ordered rows) or an unattached skill. */
type Item = { skill: Skill; enabled: boolean; index: number | null };

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

  const save = (next: SkillRow[]) =>
    setLinks.mutate(next.map((r) => ({ skill_id: r.skill.id, enabled: r.enabled })));
  const toggle = (item: Item, enabled: boolean) =>
    item.index === null
      ? save([...rows, { skill: item.skill, enabled: true }])
      : save(rows.map((r, j) => (j === item.index ? { ...r, enabled } : r)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    if (!rows[from]?.enabled || !rows[to]?.enabled) return;
    save(moveItem(rows, from, to));
  };
  const detach = (i: number) => save(rows.filter((_, j) => j !== i));

  const items: Item[] = [
    ...rows.map((r, index) => ({ ...r, index })),
    ...unattachedSkills(rows, skills).map((skill) => ({ skill, enabled: false, index: null })),
  ];
  const visible = items.filter((it) => matchesFilter(it.skill, filter));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { enabled: countEffective(rows), total: skills.length })}
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
      </div>
      <p style={s.hint}>{t("skills.hint")}</p>

      {skills.length === 0 ? (
        <div style={s.empty}>
          {t("skills.noSkills")}{" "}
          <Link href="/skills/new" style={s.link}>
            {t("skills.createFirst")}
          </Link>
        </div>
      ) : visible.length === 0 ? (
        <div style={s.empty}>{t("skills.noMatch", { query: filter })}</div>
      ) : (
        <ul style={s.list}>
          {visible.map((item) => {
            const { skill, enabled, index } = item;
            const color = SKILL_TYPE_COLOR[skill.type];
            const name = skill.name;
            const movable = index !== null && enabled;
            return (
              <li
                key={skill.id}
                draggable={movable}
                onDragStart={movable ? () => setDragFrom(index) : undefined}
                onDragOver={movable ? (e) => e.preventDefault() : undefined}
                onDrop={
                  movable
                    ? () => {
                        if (dragFrom !== null) move(dragFrom, index);
                        setDragFrom(null);
                      }
                    : undefined
                }
                onDragEnd={() => setDragFrom(null)}
                style={s.row(dragFrom === index && index !== null, enabled && skill.enabled)}
              >
                <span
                  style={s.handle(movable)}
                  title={movable ? t("skills.dragHandle", { name }) : t("skills.dragDisabled")}
                  aria-hidden
                >
                  <Icon.Menu size={14} />
                </span>
                <Checkbox
                  checked={enabled}
                  onChange={(v) => toggle(item, v)}
                  label={
                    <span className="mono" style={s.name} title={skill.description}>
                      {name}
                    </span>
                  }
                />
                {!skill.enabled && (
                  <span title={t("skills.disabledGloballyTitle")}>
                    <Badge color="var(--warn)" bg="var(--warn-bg)">
                      {t("skills.disabledGlobally")}
                    </Badge>
                  </span>
                )}
                <span style={s.rowRight}>
                  <Badge color={color.fg} bg={color.bg}>
                    {tSkills(`type.${skill.type}`)}
                  </Badge>
                  {movable && (
                    <>
                      <IconBtn
                        icon="ArrowUp"
                        size={26}
                        label={t("skills.moveUp", { name })}
                        onClick={() => move(index, enabledNeighbour(rows, index, -1))}
                      />
                      <IconBtn
                        icon="ArrowDown"
                        size={26}
                        label={t("skills.moveDown", { name })}
                        onClick={() => move(index, enabledNeighbour(rows, index, 1))}
                      />
                    </>
                  )}
                  {index !== null && (
                    <IconBtn
                      icon="X"
                      size={26}
                      label={t("skills.detach", { name })}
                      onClick={() => detach(index)}
                    />
                  )}
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
