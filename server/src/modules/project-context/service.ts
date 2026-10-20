import type { ContextAttachments, ContextDocRow, SpecFile } from '@devdigest/shared';
import {
  ConflictError,
  ExternalServiceError,
  NotFoundError,
  ValidationError,
  redactSecrets,
} from '../../platform/errors.js';
import { DOC_REF } from './constants.js';
import {
  buildAgentRows,
  buildSkillRows,
  categoryOf,
  discoverDocs,
  effectiveDocList,
  estTokens,
  fitDocs,
  usedByCounts,
  type DiscoveredDoc,
  type EffectiveDoc,
  type FittedDoc,
} from './helpers.js';
import type { ContextRepoRef, ProjectContextDeps, RepoDocs } from './ports.js';

/** What a review run injects (plan S7): fitted docs, budget-omitted and unreadable paths. */
export interface RunProjectContext {
  injected: FittedDoc[];
  omitted: string[];
  skipped: string[];
}

/**
 * L05 Project Context use cases (plan S6): list/read the repo's Markdown
 * documents from git objects at `DOC_REF` (never the working tree), the agent
 * and skill Context-tab views and attachment writes, and the per-run list.
 */
export class ProjectContextService {
  constructor(private readonly deps: ProjectContextDeps) {}

  /** Every discovered document with token estimate (R2) and used-by count (AC-5, Q4). */
  async listDocs(workspaceId: string, repoId: string): Promise<SpecFile[]> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const [docs, usedBy] = await Promise.all([
      this.discover(repo),
      this.usedBy(workspaceId, repoId),
    ]);
    return docs
      .map((d) => {
        const size = d.size ?? 0;
        return {
          path: d.path,
          category: categoryOf(d.path),
          size,
          tokens: estTokens(size),
          used_by: usedBy.get(d.path) ?? 0,
        };
      })
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  /** One discovered document with its content; anything not discovered is 404 (AC-41). */
  async readDoc(workspaceId: string, repoId: string, path: string): Promise<SpecFile> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const doc = (await this.discover(repo)).find((d) => d.path === path);
    if (!doc) throw new NotFoundError(`Document ${path} not found`);
    let content: string | null;
    try {
      content = await this.deps.git.showFile(repo, DOC_REF, doc.source);
    } catch (err) {
      throw new ExternalServiceError(`Could not read ${path}: ${errMsg(err)}`);
    }
    if (content === null) throw new NotFoundError(`Document ${path} not found`);
    const usedBy = await this.usedBy(workspaceId, repoId);
    return {
      path: doc.path,
      category: categoryOf(doc.path),
      size: content.length,
      tokens: estTokens(content.length),
      used_by: usedBy.get(doc.path) ?? 0,
      content,
    };
  }

  async agentView(workspaceId: string, agentId: string, repoId: string): Promise<ContextAttachments> {
    if (!(await this.deps.repo.agentExists(workspaceId, agentId))) {
      throw new NotFoundError(`Agent ${agentId} not found`);
    }
    const repo = await this.requireRepo(workspaceId, repoId);
    const docs = await this.discover(repo);
    const own = await this.deps.repo.agentDocs(workspaceId, agentId, repoId);
    const effective = await this.effectiveFor(workspaceId, agentId, repoId, own);
    const { texts, tokens } = await this.readEffective(repo, docs, effective);
    const rows = buildAgentRows(docs, own, effective, textLengths(texts));
    return view(repoId, rows, own.length, tokens);
  }

  async setAgentDocs(
    workspaceId: string,
    agentId: string,
    repoId: string,
    paths: string[],
  ): Promise<ContextAttachments> {
    if (!(await this.deps.repo.agentExists(workspaceId, agentId))) {
      throw new NotFoundError(`Agent ${agentId} not found`);
    }
    const repo = await this.requireRepo(workspaceId, repoId);
    const stored = await this.deps.repo.agentDocs(workspaceId, agentId, repoId);
    await this.validatePaths(repo, paths, stored);
    await this.deps.repo.setAgentDocs(workspaceId, agentId, repoId, paths);
    return this.agentView(workspaceId, agentId, repoId);
  }

  async skillView(workspaceId: string, skillId: string, repoId: string): Promise<ContextAttachments> {
    if (!(await this.deps.repo.skillExists(workspaceId, skillId))) {
      throw new NotFoundError(`Skill ${skillId} not found`);
    }
    const repo = await this.requireRepo(workspaceId, repoId);
    const docs = await this.discover(repo);
    const own = await this.deps.repo.skillDocs(workspaceId, skillId, repoId);
    // T applies the same limits as a run (Q3).
    const { texts, tokens } = await this.readEffective(repo, docs, effectiveDocList(own, []));
    const rows = buildSkillRows(docs, own, textLengths(texts));
    return view(repoId, rows, own.length, tokens);
  }

  async setSkillDocs(
    workspaceId: string,
    skillId: string,
    repoId: string,
    paths: string[],
  ): Promise<ContextAttachments> {
    if (!(await this.deps.repo.skillExists(workspaceId, skillId))) {
      throw new NotFoundError(`Skill ${skillId} not found`);
    }
    const repo = await this.requireRepo(workspaceId, repoId);
    const stored = await this.deps.repo.skillDocs(workspaceId, skillId, repoId);
    await this.validatePaths(repo, paths, stored);
    await this.deps.repo.setSkillDocs(workspaceId, skillId, repoId, paths);
    return this.skillView(workspaceId, skillId, repoId);
  }

  /**
   * The documents a run of `agentId` on `repoId` injects, resolved once per run
   * (AC-30, AC-39). Unreadable or no longer discovered paths are `skipped`
   * (AC-35); the rest go through the limits (AC-36, AC-37). `skills` is the
   * run's already-resolved effective skill set: when given, it is used as-is so
   * the prompt's skills and the inherited documents come from ONE snapshot.
   */
  async forRun(
    workspaceId: string,
    agentId: string,
    repoId: string,
    skills?: { id: string; name: string }[],
  ): Promise<RunProjectContext> {
    const empty: RunProjectContext = { injected: [], omitted: [], skipped: [] };
    const repo = await this.deps.repo.findRepo(workspaceId, repoId);
    if (!repo) return empty;
    const own = await this.deps.repo.agentDocs(workspaceId, agentId, repoId);
    const effective = await this.effectiveFor(workspaceId, agentId, repoId, own, skills);
    if (effective.length === 0) return empty;
    const docs = (await this.discoverOrNull(repo)) ?? [];
    const read = await this.readAll(repo, docs, effective);
    const { injected, omitted } = fitDocs(read.texts);
    return { injected, omitted, skipped: read.skipped };
  }

  /**
   * The union of documents attached to any agent or skill for the repo, read at
   * `DOC_REF` (PR Brief, AC-86, AC-87). Best-effort like `forRun`: an unknown
   * repo or no attachments → empty without touching git; no clone → every path
   * skipped with `clone: false`; an undiscovered or unreadable path → skipped.
   * No limits are applied here — the caller budgets the texts.
   */
  async repoDocs(workspaceId: string, repoId: string): Promise<RepoDocs> {
    const empty: RepoDocs = { attached: [], docs: [], skipped: [], clone: true };
    const repo = await this.deps.repo.findRepo(workspaceId, repoId);
    if (!repo) return empty;
    const attached = await this.deps.repo.attachedPathsForRepo(workspaceId, repoId);
    if (attached.length === 0) return empty;
    const docs = await this.discoverOrNull(repo);
    if (!docs) return { attached, docs: [], skipped: [...attached], clone: false };
    const read = await this.readAll(
      repo,
      docs,
      attached.map((path) => ({ path, own: false, via: [] })),
    );
    return { attached, docs: read.texts, skipped: read.skipped, clone: true };
  }

  // ---- internals --------------------------------------------------------------

  private async requireRepo(workspaceId: string, repoId: string): Promise<ContextRepoRef> {
    const repo = await this.deps.repo.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError(`Repo ${repoId} not found`);
    return repo;
  }

  /** Discovered documents; no clone → 409 (AC-8), a git error → 502 with a redacted message. */
  private async discover(repo: ContextRepoRef): Promise<DiscoveredDoc[]> {
    const docs = await this.discoverOrNull(repo);
    if (!docs) throw new ConflictError('No local clone yet — import or resync the repo');
    return docs;
  }

  private async discoverOrNull(repo: ContextRepoRef): Promise<DiscoveredDoc[] | null> {
    try {
      const entries = await this.deps.git.listTree(repo, DOC_REF);
      if (!entries) return null;
      // Link texts come from git objects of the same tree — no on-disk symlink is followed.
      return await discoverDocs(entries, (linkPath) =>
        this.deps.git.showFile(repo, DOC_REF, linkPath).catch(() => null),
      );
    } catch (err) {
      throw new ExternalServiceError(`Could not list the repo's documents: ${errMsg(err)}`);
    }
  }

  /** The agent's effective list: own paths, then its effective skills' paths (AC-30). */
  /** Path → number of agents with it in their effective list (AC-5, Q4); shared by list and read. */
  private async usedBy(workspaceId: string, repoId: string): Promise<Map<string, number>> {
    const [ids, ownByAgent] = await Promise.all([
      this.deps.repo.agentIds(workspaceId),
      this.deps.repo.agentDocsByRepo(workspaceId, repoId),
    ]);
    const lists = await Promise.all(
      ids.map(async (id) =>
        (await this.effectiveFor(workspaceId, id, repoId, ownByAgent.get(id) ?? [])).map(
          (e) => e.path,
        ),
      ),
    );
    return usedByCounts(lists);
  }

  private async effectiveFor(
    workspaceId: string,
    agentId: string,
    repoId: string,
    own: string[],
    given?: { id: string; name: string }[],
  ): Promise<EffectiveDoc[]> {
    const skills = given ?? (await this.deps.skills.effectiveSkills(agentId));
    const byId =
      skills.length > 0
        ? await this.deps.repo.skillDocsFor(
            workspaceId,
            skills.map((s) => s.id),
            repoId,
          )
        : new Map<string, string[]>();
    return effectiveDocList(
      own,
      skills.map((s) => ({ name: s.name, paths: byId.get(s.id) ?? [] })),
    );
  }

  /** Read every effective path that is discovered; a null or failing read is skipped. */
  private async readAll(
    repo: ContextRepoRef,
    docs: DiscoveredDoc[],
    effective: EffectiveDoc[],
  ): Promise<{ texts: { path: string; text: string }[]; skipped: string[] }> {
    const byPath = new Map(docs.map((d) => [d.path, d]));
    const results = await Promise.all(
      effective.map(async (e) => {
        const doc = byPath.get(e.path);
        if (!doc) return { path: e.path, text: null };
        const text = await this.deps.git.showFile(repo, DOC_REF, doc.source).catch(() => null);
        return { path: e.path, text };
      }),
    );
    const texts: { path: string; text: string }[] = [];
    const skipped: string[] = [];
    for (const r of results) {
      if (r.text === null) skipped.push(r.path);
      else texts.push({ path: r.path, text: r.text });
    }
    return { texts, skipped };
  }

  /** Texts of the effective list and T = tokens of what a run would inject (AC-17). */
  private async readEffective(
    repo: ContextRepoRef,
    docs: DiscoveredDoc[],
    effective: EffectiveDoc[],
  ): Promise<{ texts: { path: string; text: string }[]; tokens: number }> {
    const { texts } = await this.readAll(repo, docs, effective);
    const tokens = fitDocs(texts).injected.reduce((sum, d) => sum + estTokens(d.text.length), 0);
    return { texts, tokens };
  }

  /**
   * AC-40, EC-20: no duplicates, and every path is a discovered document or one
   * already stored for this owner and repo (a missing doc survives a reorder).
   * Throws before anything is stored.
   */
  private async validatePaths(
    repo: ContextRepoRef,
    paths: string[],
    stored: string[],
  ): Promise<void> {
    const dupes = paths.filter((p, i) => paths.indexOf(p) !== i);
    if (dupes.length > 0) {
      throw new ValidationError('Duplicate document paths', { paths: [...new Set(dupes)] });
    }
    const known = new Set([...(await this.discover(repo)).map((d) => d.path), ...stored]);
    const unknown = paths.filter((p) => !known.has(p));
    if (unknown.length > 0) {
      throw new ValidationError('Not a document of this repo', { paths: unknown });
    }
  }
}

function view(
  repoId: string,
  rows: ContextDocRow[],
  attached: number,
  tokens: number,
): ContextAttachments {
  return { repo_id: repoId, rows, attached, total: rows.length, tokens };
}

function textLengths(texts: { path: string; text: string }[]): Map<string, number> {
  return new Map(texts.map((t) => [t.path, t.text.length]));
}

function errMsg(err: unknown): string {
  return redactSecrets(err instanceof Error ? err.message : String(err));
}
