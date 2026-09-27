import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** One row of the Skills tab: an attached skill with its per-agent switch. */
export interface SkillRow {
  skill: Skill;
  enabled: boolean;
}

/** Join the agent's ordered links with the workspace skills (unknown ids dropped). */
export function toRows(links: AgentSkillLink[], skills: Skill[]): SkillRow[] {
  const byId = new Map(skills.map((sk) => [sk.id, sk]));
  return [...links]
    .sort((a, b) => a.order - b.order)
    .flatMap((l) => {
      const skill = byId.get(l.skill_id);
      return skill ? [{ skill, enabled: l.enabled }] : [];
    });
}

/** A copy of `items` with the element at `from` moved to index `to` (clamped). */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item as T);
  return next;
}

/** Rows that reach the prompt: enabled for the agent AND enabled globally. */
export function countEffective(rows: SkillRow[]): number {
  return rows.filter((r) => r.enabled && r.skill.enabled).length;
}

/** Case-insensitive match over a skill's name, type and description. */
export function matchesFilter(skill: Skill, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || `${skill.name} ${skill.type} ${skill.description}`.toLowerCase().includes(q);
}
