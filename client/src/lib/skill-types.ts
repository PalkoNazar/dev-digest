/* skill-types.ts — skill type list + colours, shared by the Skills page and the
   agent editor's Skills tab. Labels are i18n (`skills.type.<type>`). */
import type { SkillType } from "@devdigest/shared";

export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Foreground / background token pair per type, as in the mockups. */
export const SKILL_TYPE_COLOR: Record<SkillType, { fg: string; bg: string }> = {
  rubric: { fg: "var(--accent-text)", bg: "var(--accent-bg)" },
  convention: { fg: "var(--ok)", bg: "var(--ok-bg)" },
  security: { fg: "var(--crit)", bg: "var(--crit-bg)" },
  custom: { fg: "var(--info)", bg: "var(--info-bg)" },
};
