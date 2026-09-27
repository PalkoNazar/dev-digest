import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';

/** What the skills use cases need from persistence, in domain terms. */

export interface NewSkill {
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled: boolean;
}

export interface SkillPatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export interface SkillsRepo {
  list(workspaceId: string): Promise<Skill[]>;
  get(workspaceId: string, id: string): Promise<Skill | null>;
  findByName(workspaceId: string, name: string): Promise<Skill | null>;
  /** Insert the skill and its first `skill_versions` row. */
  insert(workspaceId: string, skill: NewSkill): Promise<Skill>;
  /**
   * Apply `patch`. With `bumpTo`, also set `version = bumpTo` and record the new
   * body in `skill_versions` — atomically.
   */
  update(workspaceId: string, id: string, patch: SkillPatch, bumpTo?: number): Promise<Skill | null>;
  /** Body versions of a skill, newest first (caller checks the workspace). */
  listVersions(skillId: string): Promise<SkillVersion[]>;
  /** Delete the skill; its versions and agent links cascade. */
  delete(workspaceId: string, id: string): Promise<boolean>;
}

export interface SkillsDeps {
  repo: SkillsRepo;
}
