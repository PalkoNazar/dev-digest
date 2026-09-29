/* AgentCard — model chip, skills count, enabled toggle, delete. Stats are an A5
   mount; we render the provider/model + skill count here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, IconBtn, Badge, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { modelColor } from "./helpers";
import { s } from "./styles";

export function AgentCard({
  ag,
  active,
  skillCount,
  onClick,
  onToggle,
  onDelete,
}: {
  ag: Agent;
  active?: boolean;
  skillCount?: number;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  /** Asks to delete; the parent owns the confirm dialog (outside this clickable card). */
  onDelete?: () => void;
}) {
  const t = useTranslations("agents");
  const color = modelColor(ag.model);
  const skills = skillCount ?? ag.skill_count;
  return (
    <div onClick={onClick} style={s.card(!!active, ag.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Cpu size={15} />
        </div>
        <span style={s.name}>{ag.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={ag.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        {onDelete && (
          <div onClick={(e) => e.stopPropagation()} style={s.delete}>
            <IconBtn icon="Trash" size={24} label={t("card.delete", { name: ag.name })} onClick={onDelete} />
          </div>
        )}
      </div>
      <div style={s.description}>{ag.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <span className="mono" style={s.modelChip(color)}>
          {ag.model}
        </span>
        {skills != null && (
          <Badge color="var(--text-secondary)" icon="Sparkles">
            {t("card.skillCount", { count: skills })}
          </Badge>
        )}
      </div>
    </div>
  );
}
