/* SkillCard — list card on /skills: name, global enabled toggle, description,
   type + source badges and how many agents use the skill. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SKILL_TYPE_COLOR } from "@/lib/skill-types";
import { SOURCE_ICON } from "./constants";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const color = SKILL_TYPE_COLOR[skill.type];
  return (
    // The whole card is a mouse target; for keyboard / screen readers the name is
    // the one "open" button and the switch is a separate sibling control.
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={14} />
        </div>
        <button
          type="button"
          className="mono"
          style={s.name}
          aria-current={active ? "true" : undefined}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
        >
          {skill.name}
        </button>
        {onToggle && (
          <span onClick={(e) => e.stopPropagation()} title={t("card.toggle", { name: skill.name })}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </span>
        )}
      </div>
      <div style={s.description}>{skill.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <Badge color={color.fg} bg={color.bg}>
          {t(`type.${skill.type}`)}
        </Badge>
        <span style={s.source}>
          {React.createElement(Icon[SOURCE_ICON[skill.source]], { size: 12 })}
          {t(`source.${skill.source}`)}
        </span>
      </div>
      {skill.agent_count != null && (
        <div style={s.footer}>{t("card.agents", { count: skill.agent_count })}</div>
      )}
    </div>
  );
}
