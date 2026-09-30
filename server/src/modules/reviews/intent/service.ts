import type {
  IntentSource,
  PrIntentRecord,
  PrIntentResponse,
  RepoRef,
  UnresolvedRef,
} from '@devdigest/shared';
import { estTokens as estMessageTokens } from '@devdigest/reviewer-core';
import { ConfigError, NotFoundError, redactSecrets } from '../../../platform/errors.js';
import { withTimeout } from '../../../platform/resilience.js';
import {
  DESCRIPTIVE_BODY_MIN_CHARS,
  FALLBACK_REASON_MAX_CHARS,
  INTENT_MAX_TOKENS,
  INTENT_TIMEOUT_MS,
  MAX_ISSUES,
} from './constants.js';
import {
  budgetContext,
  clampIntent,
  computeMissingContext,
  fallbackIntent,
  formatComponents,
  intentInputHash,
  isStale,
  scoreConfidence,
} from './helpers.js';
import type { DeriveOptions, IntentDeps, IntentDeriver, IntentEventSink } from './ports.js';
import { buildIntentMessages } from './prompt.js';
import { extractRefs, stripHtmlComments } from './refs.js';
import {
  IntentExtraction,
  type FetchedDoc,
  type FetchedIssue,
  type FileSummary,
  type IntentDerivation,
  type IntentPull,
  type IntentRecordWrite,
  type IssueRef,
} from './types.js';

type GitHub = Awaited<ReturnType<IntentDeps['github']>>;

const noop: IntentEventSink = () => undefined;

/**
 * Intent layer — derives a PR's intent with a separate cheap model (the
 * `review_intent` feature model) from title, body, linked/mentioned issues,
 * linked plan/spec docs at the head SHA, branch and files + hunk headers.
 * Never sees a diff body. Unreadable sources are recorded, never invented.
 *
 * Failure policy: a classifier error / missing key / timeout gives a low-
 * confidence fallback that is still saved; only NotFoundError escapes.
 * Logging: counts, sizes, paths and refs only — never body/issue/doc/diff text.
 */
export class IntentService implements IntentDeriver {
  constructor(private readonly deps: IntentDeps) {}

  private async pull(workspaceId: string, prId: string): Promise<IntentPull> {
    const pull = await this.deps.repo.getPullForIntent(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return pull;
  }

  /** Stored intent (no LLM call) + whether the PR changed since. */
  async get(workspaceId: string, prId: string): Promise<PrIntentResponse> {
    const pull = await this.pull(workspaceId, prId);
    const stored = await this.deps.repo.getIntentRecord(workspaceId, prId);
    return { intent: stored?.record ?? null, stale: isStale(stored, pull) };
  }

  /** Manual Recompute: re-derive now, from the PR's current diff summary. */
  async recompute(workspaceId: string, prId: string): Promise<PrIntentResponse> {
    await this.pull(workspaceId, prId);
    const summary = await this.deps
      .loadDiffSummary(workspaceId, prId)
      .catch(() => ({ files: [], headSha: null }));
    await this.derive(workspaceId, prId, {
      force: true,
      files: summary.files,
      ...(summary.headSha ? { filesHeadSha: summary.headSha } : {}),
    });
    // Re-read: if the PR head moved meanwhile the record was saved without a cache
    // key, and `stale` must say so instead of presenting it as current.
    return this.get(workspaceId, prId);
  }

  async derive(workspaceId: string, prId: string, opts: DeriveOptions = {}): Promise<IntentDerivation> {
    const t0 = Date.now();
    const emit = opts.onEvent ?? noop;
    const files = opts.files ?? [];
    const pull = await this.pull(workspaceId, prId);
    const [stored, choice] = await Promise.all([
      this.deps.repo.getIntentRecord(workspaceId, prId),
      this.deps.repo.intentFeatureModel(workspaceId),
    ]);
    const inputHash = intentInputHash(pull);
    // The files were summarized at another head than the row we just read (a sync
    // raced us): classify, but never cache it under the new head.
    const snapshotMoved = !!opts.filesHeadSha && opts.filesHeadSha !== pull.headSha;

    // ---- cache: a classifier result for the same inputs and model ------------
    const cached = stored?.record;
    if (
      !opts.force &&
      cached &&
      stored.inputHash === inputHash &&
      cached.mode === 'llm' &&
      cached.provider === choice.provider &&
      cached.model === choice.model
    ) {
      emit(
        'info',
        `Intent: cached (llm, ${cached.confidence}) for ${pull.headSha.slice(0, 7)} — classifier skipped`,
      );
      emit('result', `Intent ready — ${cached.confidence}`, { type: 'intent_ready' });
      return {
        record: cached,
        source: 'cached',
        ms: Date.now() - t0,
        estTokens: sumTokens(cached),
      };
    }

    // ---- gather sources -------------------------------------------------------
    const body = stripHtmlComments(pull.body ?? '').trim();
    const refs = extractRefs({
      title: pull.title,
      body: pull.body,
      branch: pull.branch,
      repo: pull.repo,
      prNumber: pull.number,
    });
    const unresolved: UnresolvedRef[] = [...refs.unresolved];

    // No GitHub client never fails derivation: a missing token and any other
    // error both leave issues unresolved (docs still come from the local clone).
    let github: GitHub | null = null;
    let noGithubReason: UnresolvedRef['reason'] = 'no_github_token';
    try {
      github = await this.deps.github();
    } catch (err) {
      if (!(err instanceof ConfigError)) noGithubReason = 'fetch_failed';
    }

    const issueRefs = await this.issueRefs(pull, refs.issues, github, unresolved);
    emit(
      'info',
      `Intent refs: ${issueRefs.length} issue(s), ${refs.docs.length} doc(s), ${unresolved.length} unresolved`,
    );
    const issues = await this.fetchIssues(pull.repo, issueRefs, github, noGithubReason, unresolved, emit);
    if (snapshotMoved) {
      emit('info', `Intent: PR head moved to ${pull.headSha.slice(0, 7)} while loading files — result not cached`);
    }
    const docs = await this.fetchDocs(
      pull,
      refs.docs.map((d) => d.path),
      github,
      noGithubReason,
      unresolved,
      emit,
    );

    const budget = budgetContext({ body, issues, docs });
    unresolved.push(...budget.overBudget);

    // A template load failure must end in a saved fallback too, so it is
    // rethrown inside the classifier try below instead of escaping here.
    let systemError: unknown = null;
    const system = await this.deps.systemPrompt().catch((err: unknown) => {
      systemError = err;
      return '';
    });
    const { messages, components } = buildIntentMessages({
      system,
      title: pull.title,
      body: budget.body,
      branch: pull.branch,
      issues: budget.issues,
      docs: budget.docs,
      files,
      unresolved,
    });
    const promptTokens = components.reduce((n, c) => n + c.est_tokens, 0);
    emit('info', `Intent prompt: ${formatComponents(components)} = ~${promptTokens} tok est`);

    // ---- classifier call (bounded; any failure → fallback) --------------------
    const base = {
      head_sha: pull.headSha,
      input_hash: snapshotMoved ? null : inputHash,
      prompt_components: components,
      provider: choice.provider,
      model: choice.model,
    };
    // What the code saw, independent of whether the classifier call succeeds.
    const hasDescriptiveSource =
      budget.body.text.length >= DESCRIPTIVE_BODY_MIN_CHARS ||
      budget.issues.length + budget.docs.length > 0;
    let write: IntentRecordWrite;
    let source: IntentDerivation['source'];
    const callStart = Date.now();
    try {
      if (systemError) throw systemError;
      const llm = await this.deps.llm(choice.provider);
      emit(
        'tool',
        `LLM call · intent-classifier · ${choice.provider}/${choice.model} · ~${estMessageTokens(messages)} tok est`,
      );
      const timeoutMs = this.deps.timeoutMs ?? INTENT_TIMEOUT_MS;
      const res = await withTimeout(
        llm.completeStructured({
          model: choice.model,
          schema: IntentExtraction,
          schemaName: 'IntentExtraction',
          messages,
          temperature: 0,
          maxTokens: INTENT_MAX_TOKENS,
          maxRetries: 1,
          timeoutMs,
          // Some OpenRouter endpoints ignore json_schema and break the schema.
          requireParameters: true,
        }),
        timeoutMs,
      );
      const out = clampIntent(res.data);
      if (!out.summary) throw new Error('Intent classifier returned an empty summary');
      const resolvedChars = [...budget.issues, ...budget.docs].map((s) => s.text.length);
      const confidence = scoreConfidence({
        title: pull.title,
        bodyChars: budget.body.text.length,
        resolvedSourceChars: resolvedChars,
        evidenceStrength: res.data.evidence_strength,
      });
      const missing = computeMissingContext({ unresolved, hasDescriptiveSource });
      write = {
        ...base,
        ...out,
        confidence,
        mode: 'llm',
        missing_context: missing,
        sources_used: sourcesUsed(pull, budget, files),
        unresolved_refs: unresolved,
        tokens_in: res.tokensIn,
        tokens_out: res.tokensOut,
        cost_usd: res.costUsd,
        fallback_reason: null,
      };
      source = 'llm';
      emit(
        'result',
        `Intent classifier done — ${res.tokensIn}→${res.tokensOut} tokens · ${formatCost(res.costUsd)} · ` +
          `${((Date.now() - callStart) / 1000).toFixed(1)}s · confidence ${confidence} · ` +
          `missing context: ${missing ? `yes (${unresolved.length} unresolved)` : 'no'}`,
      );
    } catch (err) {
      const reason = redactSecrets(err instanceof Error ? err.message : String(err)).slice(
        0,
        FALLBACK_REASON_MAX_CHARS,
      );
      write = {
        ...base,
        ...fallbackIntent({ title: pull.title, branch: pull.branch, files }),
        confidence: 'low',
        mode: 'fallback',
        missing_context: computeMissingContext({ unresolved, hasDescriptiveSource }),
        context_gaps: [],
        sources_used: fallbackSources(pull, files),
        unresolved_refs: unresolved,
        tokens_in: null,
        tokens_out: null,
        cost_usd: null,
        fallback_reason: reason,
      };
      source = 'fallback';
      emit('info', `Intent: fallback (${reason}) — confidence low`);
    }

    const record = await this.deps.repo.saveIntentRecord(workspaceId, prId, write);
    if (!record) throw new NotFoundError('Pull request not found');
    emit('result', `Intent ready — ${record.confidence}`, { type: 'intent_ready' });
    return { record, source, ms: Date.now() - t0, estTokens: promptTokens };
  }

  /** Closing-linked issues first (GraphQL), then body mentions; capped at MAX_ISSUES. */
  private async issueRefs(
    pull: IntentPull,
    mentioned: IssueRef[],
    github: GitHub | null,
    unresolved: UnresolvedRef[],
  ): Promise<IssueRef[]> {
    const linked =
      github && pull.repo
        ? await github.linkedIssueNumbers(pull.repo, pull.number).catch(() => [] as number[])
        : [];
    const all: IssueRef[] = [];
    const seen = new Set<number>();
    for (const n of linked) {
      if (seen.has(n) || n === pull.number) continue;
      seen.add(n);
      all.push({ number: n, ref: `#${n}`, kind: 'linked_issue' });
    }
    for (const i of mentioned) {
      if (seen.has(i.number)) continue;
      seen.add(i.number);
      all.push(i);
    }
    for (const over of all.slice(MAX_ISSUES)) {
      unresolved.push({ kind: 'issue', ref: over.ref, reason: 'limit_reached' });
    }
    return all.slice(0, MAX_ISSUES);
  }

  private async fetchIssues(
    repo: RepoRef | null,
    refs: IssueRef[],
    github: GitHub | null,
    noGithubReason: UnresolvedRef['reason'],
    unresolved: UnresolvedRef[],
    emit: IntentEventSink,
  ): Promise<FetchedIssue[]> {
    const out: FetchedIssue[] = [];
    for (const ref of refs) {
      let reason: UnresolvedRef['reason'] | null = null;
      if (!github) reason = noGithubReason;
      else if (!repo) reason = 'fetch_failed';
      else {
        try {
          const issue = await github.getIssue(repo, ref.number);
          const text = stripHtmlComments(issue.body ?? '').trim();
          out.push({ ref: ref.ref, kind: ref.kind, title: issue.title, text, truncated: false });
          emit('info', `Intent: issue ${ref.ref} fetched (${text.length} chars)`);
        } catch (err) {
          reason = httpStatus(err) === 404 ? 'not_found' : 'fetch_failed';
        }
      }
      if (reason) {
        unresolved.push({ kind: 'issue', ref: ref.ref, reason });
        emit('info', `Intent: issue ${ref.ref} unresolved (${reason})`);
      }
    }
    return out;
  }

  /** Docs at the head SHA: local clone (`git show`) first, then the GitHub contents API. */
  private async fetchDocs(
    pull: IntentPull,
    paths: string[],
    github: GitHub | null,
    noGithubReason: UnresolvedRef['reason'],
    unresolved: UnresolvedRef[],
    emit: IntentEventSink,
  ): Promise<FetchedDoc[]> {
    const out: FetchedDoc[] = [];
    const sha = pull.headSha.slice(0, 7);
    for (const path of paths) {
      let reason: UnresolvedRef['reason'] | null = null;
      if (!pull.repo) reason = 'fetch_failed';
      else {
        let text = await this.deps.git.showFile(pull.repo, pull.headSha, path).catch(() => null);
        let via = 'local clone';
        if (text === null && github) {
          via = 'GitHub';
          try {
            const file = await github.getFileAtRef(pull.repo, pull.headSha, path);
            if (file.status === 'found') text = file.text;
            else if (file.status === 'too_large') reason = 'too_large';
          } catch {
            reason = 'fetch_failed';
          }
        }
        if (text !== null) {
          const clean = stripHtmlComments(text).trim();
          out.push({ path, text: clean, truncated: false });
          emit('info', `Intent: doc ${path} @${sha} via ${via} (${clean.length} chars)`);
        } else if (!reason) {
          // Not in the local clone and GitHub was never asked → say why, not "not found".
          reason = github ? 'not_found' : noGithubReason;
        }
      }
      if (reason) {
        unresolved.push({ kind: 'doc', ref: path, reason });
        emit('info', `Intent: doc ${path} @${sha} unresolved (${reason})`);
      }
    }
    return out;
  }
}

/** What was actually fed to the classifier, recorded by code (not by the model). */
function sourcesUsed(
  pull: IntentPull,
  budget: ReturnType<typeof budgetContext>,
  files: FileSummary[],
): IntentSource[] {
  const sources: IntentSource[] = [{ kind: 'title', ref: 'title' }];
  if (budget.body.text.trim().length > 0) {
    sources.push({ kind: 'body', ref: 'body', truncated: budget.body.truncated });
  }
  for (const i of budget.issues) {
    sources.push({ kind: i.kind, ref: i.ref, title: i.title, truncated: i.truncated });
  }
  for (const d of budget.docs) sources.push({ kind: 'spec_doc', ref: d.path, truncated: d.truncated });
  sources.push({ kind: 'branch', ref: pull.branch });
  if (files.length > 0) sources.push({ kind: 'file_hunks', ref: `${files.length} file(s)` });
  return sources;
}

/** The fallback intent is built from title, branch and paths only. */
function fallbackSources(pull: IntentPull, files: FileSummary[]): IntentSource[] {
  const sources: IntentSource[] = [
    { kind: 'title', ref: 'title' },
    { kind: 'branch', ref: pull.branch },
  ];
  if (files.length > 0) sources.push({ kind: 'file_hunks', ref: `${files.length} file(s)` });
  return sources;
}

function sumTokens(rec: PrIntentRecord): number {
  return rec.prompt_components.reduce((n, c) => n + c.est_tokens, 0);
}

function formatCost(cost: number | null): string {
  return cost == null ? '$?' : `$${cost.toFixed(4)}`;
}

function httpStatus(err: unknown): number | undefined {
  const status = (err as { status?: unknown })?.status;
  return typeof status === 'number' ? status : undefined;
}
