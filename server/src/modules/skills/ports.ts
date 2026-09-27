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

/** Raw usage counts for a skill since a date (rates are derived in helpers). */
export interface SkillUsageCounts {
  agents: { id: string; name: string; link_enabled: boolean; agent_enabled: boolean }[];
  runsTotal: number;
  runsWithSkill: number;
  findings: number;
  accepted: number;
  dismissed: number;
  byCategory: { category: string; count: number }[];
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
  /** Body versions of a workspace's skill, newest first ([] for another workspace). */
  listVersions(workspaceId: string, skillId: string): Promise<SkillVersion[]>;
  /** Usage of a skill since `since` (caller checks the skill is in the workspace). */
  usage(workspaceId: string, skillId: string, since: Date): Promise<SkillUsageCounts>;
  /** Delete the skill; its versions and agent links cascade. */
  delete(workspaceId: string, id: string): Promise<boolean>;
}

export interface SkillsDeps {
  repo: SkillsRepo;
}
