import type { Skill } from "@devdigest/shared";

/** Case-insensitive filter over a skill's name, type and description. */
export function filterSkills(skills: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) => `${sk.name} ${sk.type} ${sk.description}`.toLowerCase().includes(q));
}
