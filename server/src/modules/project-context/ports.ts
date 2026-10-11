import type { GitClient } from '@devdigest/shared';

/**
 * What the Project Context use cases need (plan S6). Every `ContextRepo` method
 * is scoped by `workspaceId`; attachment rows are scoped through their parent
 * agent/skill and the repo.
 */

export interface ContextRepoRef {
  id: string;
  owner: string;
  name: string;
}

export interface ContextRepo {
  findRepo(workspaceId: string, repoId: string): Promise<ContextRepoRef | null>;
  agentExists(workspaceId: string, agentId: string): Promise<boolean>;
  skillExists(workspaceId: string, skillId: string): Promise<boolean>;
  /** The agent's own attached paths for the repo, in prompt order. */
  agentDocs(workspaceId: string, agentId: string, repoId: string): Promise<string[]>;
  /** The skill's attached paths for the repo, in order. */
  skillDocs(workspaceId: string, skillId: string, repoId: string): Promise<string[]>;
  /** Replace the agent's attachments for the repo (one transaction; `order` = index). */
  setAgentDocs(workspaceId: string, agentId: string, repoId: string, paths: string[]): Promise<void>;
  /** Replace the skill's attachments for the repo (one transaction; `order` = index). */
  setSkillDocs(workspaceId: string, skillId: string, repoId: string, paths: string[]): Promise<void>;
  /** Attached paths per skill id, in order (skills without rows may be absent). */
  skillDocsFor(workspaceId: string, skillIds: string[], repoId: string): Promise<Map<string, string[]>>;
  /** Ids of every agent of the workspace (enabled or not, Q4). */
  agentIds(workspaceId: string): Promise<string[]>;
  /** Own attached paths per agent id for the repo, in order. */
  agentDocsByRepo(workspaceId: string, repoId: string): Promise<Map<string, string[]>>;
}

/** The agent's effective skills (L02 rule: linked + enabled for it + enabled globally). */
export interface EffectiveSkillsSource {
  effectiveSkills(agentId: string): Promise<{ id: string; name: string }[]>;
}

/** Read-only git access to the clone: tree listing and blob reads at a ref. */
export type DocSource = Pick<GitClient, 'listTree' | 'showFile'>;

export interface ProjectContextDeps {
  repo: ContextRepo;
  skills: EffectiveSkillsSource;
  git: DocSource;
}
