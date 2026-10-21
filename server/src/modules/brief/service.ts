import type {
  BlastRadius,
  BriefInputNote,
  FeatureModelChoice,
  LLMProvider,
  PrBrief,
  PrBriefResponse,
  PrIntentRecord,
  StructuredResult,
} from '@devdigest/shared';
import {
  AppError,
  ConfigError,
  ConflictError,
  ExternalServiceError,
  NotFoundError,
  ValidationError,
  redactSecrets,
} from '../../platform/errors.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import { classifyFile } from '../_shared/file-roles.js';
import { ISSUE_MAX_CHARS, MAX_ISSUES } from '../_shared/pr-refs-constants.js';
import { extractRefs, stripHtmlComments } from '../_shared/pr-refs.js';
import {
  LLM_ADAPTER_GRACE_MS,
  LLM_TIMEOUT_MS,
  MAX_INPUT_TOKENS,
  MAX_OUTPUT_TOKENS,
} from './constants.js';
import { capBrief, changedRanges, codePointCut, groundBrief } from './helpers.js';
import { buildBriefMessages } from './prompt.js';
import type { BriefDeps } from './ports.js';
import {
  BriefDraft,
  type BriefDocFact,
  type BriefFile,
  type BriefFileFact,
  type BriefIssueFact,
  type BriefPull,
  type GroundingSet,
  type LineRange,
} from './types.js';

/**
 * PR Why + Risk Brief (SPEC-03), plan S8.
 * - `get` reads the cache only: no fact collection, no model call (AC-36–AC-38).
 * - `generate` reads one consistent PR + files snapshot, collects the facts (each
 *   degrading to a note), makes exactly ONE structured model call raced by our
 *   timeout, grounds + caps the answer and stores it with the snapshot SHA.
 *   Single-flight per `ws:prId` (AC-59); the run is not tied to the request (AC-58).
 */

const FINISHED_MSG = 'pr brief: model call finished';
const REFUSED_MSG = 'pr brief: refused without a model call';
const SCHEMA_NAME = 'PrBriefDraft';
const TEMPERATURE = 0.2;

type CallOutcome = 'stored' | 'invalid' | 'timeout' | 'error';
type RefusalReason = 'no_files' | 'files_not_at_head' | 'no_llm_key' | 'too_large';

/** The one "finished" line (AC-69): ids, model, counts, usage — never text. Unknown → null. */
interface FinishedLog {
  prId: string;
  provider: string;
  model: string;
  est_input_tokens: number;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  outcome: CallOutcome;
  ms: number;
}

/** Facts collected around the snapshot, plus the notes of what degraded. */
interface CollectedFacts {
  body: string;
  intent: PrIntentRecord | null;
  blast: BlastRadius | null;
  issues: BriefIssueFact[];
  docs: BriefDocFact[];
  files: BriefFileFact[];
  callerFiles: string[];
  callerLines: Map<string, number[]>;
  grounding: GroundingSet;
  notes: BriefInputNote[];
}

export class BriefService {
  /** In-flight generations by `ws:prId`; removed when the run settles (AC-59). */
  private readonly inflight = new Map<string, Promise<PrBriefResponse>>();

  constructor(private readonly deps: BriefDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  // ---------------------------------------------------------------- get

  /** Cached brief + stale flag; never collects facts or calls the model (AC-36–AC-39). */
  async get(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const read = await this.deps.repo.readBrief(workspaceId, prId);
    if (!read) throw new NotFoundError('Pull request not found');
    const { brief, headSha } = read;
    return { brief, stale: !!brief && brief.run.head_sha !== headSha };
  }

  // ---------------------------------------------------------------- generate

  /** Concurrent callers of one PR share one run: one result or one error (AC-59). */
  generate(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const key = `${workspaceId}:${prId}`;
    const running = this.inflight.get(key);
    if (running) return running;
    const run: Promise<PrBriefResponse> = this.run(workspaceId, prId).finally(() => {
      if (this.inflight.get(key) === run) this.inflight.delete(key);
    });
    this.inflight.set(key, run);
    return run;
  }

  private async run(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    // 1–2. One consistent snapshot, at the head commit (AC-60, review #1).
    const snap = await this.deps.repo.snapshot(workspaceId, prId);
    if (!snap) throw new NotFoundError('Pull request not found');
    const { pull, files } = snap;
    if (files.length === 0) {
      throw this.refuse(prId, 'no_files', new ConflictError('This PR has no changed files loaded — resync the PR first'));
    }
    if (pull.detailHeadSha == null || pull.detailHeadSha !== pull.headSha) {
      throw this.refuse(
        prId,
        'files_not_at_head',
        new ConflictError("This PR's files are not at its head commit yet — resync the PR first"),
      );
    }

    // 3. The Risk Brief model; no key → refuse (AC-43, AC-67).
    const choice = await this.deps.repo.featureModel(workspaceId);
    let llm: LLMProvider;
    try {
      llm = await this.deps.llm(choice.provider);
    } catch (err) {
      if (err instanceof ConfigError) {
        throw this.refuse(
          prId,
          'no_llm_key',
          new ConfigError(
            `No API key is configured for ${choice.provider} — add one in Settings, ` +
              'or pick another model in Settings → Feature Models → Risk Brief',
          ),
        );
      }
      throw err;
    }

    // 4–5. Facts, each degrading to a note (AC-61–AC-66, AC-86–AC-89).
    const facts = await this.collect(workspaceId, pull, files);

    // 6. Messages within the budget, or refuse (AC-44–AC-46, AC-93).
    const built = buildBriefMessages({
      system: await this.deps.systemPrompt(),
      title: pull.title,
      body: facts.body,
      intent: facts.intent
        ? {
            summary: facts.intent.summary,
            in_scope: facts.intent.in_scope,
            out_of_scope: facts.intent.out_of_scope,
            confidence: facts.intent.confidence,
          }
        : null,
      blast: facts.blast,
      callerFiles: facts.callerFiles,
      callerLines: facts.callerLines,
      files: facts.files,
      issues: facts.issues,
      docs: facts.docs,
    });
    if ('tooLarge' in built) {
      throw this.refuse(
        prId,
        'too_large',
        new ValidationError(
          `This PR is too large for a brief (~${fmt(built.estInputTokens)} tokens > ${fmt(MAX_INPUT_TOKENS)})`,
        ),
        { est_input_tokens: built.estInputTokens },
      );
    }

    // 7–8. The one call (AC-42, AC-47, AC-68).
    const line: FinishedLog = {
      prId,
      provider: choice.provider,
      model: choice.model,
      est_input_tokens: built.estInputTokens,
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      outcome: 'error',
      ms: 0,
    };
    const startedAt = Date.now();
    const result = await this.callModel(llm, choice, built.messages, line, startedAt);
    const durationMs = Date.now() - startedAt;

    // 9. Ground, cap, stamp with the snapshot SHA (AC-50–AC-57, review #1).
    const capped = capBrief(groundBrief(result.data, facts.grounding));
    const brief: PrBrief = {
      summary: capped.summary,
      risks: { risks: capped.risks },
      review_focus: capped.review_focus,
      intent: facts.intent
        ? {
            summary: facts.intent.summary,
            in_scope: facts.intent.in_scope,
            out_of_scope: facts.intent.out_of_scope,
          }
        : null,
      blast: facts.blast,
      inputs: [...facts.notes, ...built.notes],
      removed: capped.removed,
      run: {
        provider: choice.provider,
        model: line.model,
        tokens_in: line.tokens_in ?? 0,
        tokens_out: line.tokens_out ?? 0,
        cost_usd: line.cost_usd,
        duration_ms: durationMs,
        est_input_tokens: built.estInputTokens,
        head_sha: pull.headSha,
        generated_at: this.now().toISOString(),
      },
    };

    // 10–11. Atomic save; return exactly what was stored (no read after write, review #4).
    let stored;
    try {
      stored = await this.deps.repo.saveBrief(workspaceId, prId, brief);
    } catch (err) {
      this.finished(line, 'error', startedAt);
      throw err;
    }
    if (!stored) {
      this.finished(line, 'error', startedAt);
      throw new NotFoundError('Pull request not found');
    }
    this.finished(line, 'stored', startedAt);
    return { brief: stored.brief, stale: stored.brief.run.head_sha !== stored.headSha };
  }

  /**
   * One structured call raced by our timeout. `withTimeout` doesn't cancel: the late
   * promise is only `.catch`-ed, and nothing after the awaited race is reachable from
   * it, so a late answer is never stored (AC-79, review #10).
   */
  private async callModel(
    llm: LLMProvider,
    choice: FeatureModelChoice,
    messages: Parameters<LLMProvider['completeStructured']>[0]['messages'],
    line: FinishedLog,
    startedAt: number,
  ): Promise<StructuredResult<BriefDraft>> {
    const call = llm.completeStructured({
      model: choice.model,
      schema: BriefDraft,
      schemaName: SCHEMA_NAME,
      messages,
      temperature: TEMPERATURE,
      maxTokens: MAX_OUTPUT_TOKENS,
      maxRetries: 0,
      transportRetries: 0,
      reasoning: 'off',
      timeoutMs: LLM_TIMEOUT_MS + LLM_ADAPTER_GRACE_MS,
    });
    call.catch(() => undefined);
    let result: StructuredResult<BriefDraft>;
    try {
      result = await withTimeout(call, this.deps.timeoutMs ?? LLM_TIMEOUT_MS);
    } catch (err) {
      const failure = classifyFailure(err);
      this.finished(line, failure.outcome, startedAt);
      throw failure.error;
    }
    line.model = result.model || choice.model;
    line.tokens_in = nonNegInt(result.tokensIn);
    line.tokens_out = nonNegInt(result.tokensOut);
    line.cost_usd = typeof result.costUsd === 'number' ? result.costUsd : null;
    return result;
  }

  private finished(line: FinishedLog, outcome: CallOutcome, startedAt: number): void {
    // usage stays null (unknown, never 0) when the call itself failed (review #9)
    this.deps.log.info({ ...line, outcome, ms: Date.now() - startedAt }, FINISHED_MSG);
  }

  /** Logs a refusal (no model call) and returns the error to throw. */
  private refuse(prId: string, reason: RefusalReason, error: AppError, extra: object = {}): AppError {
    this.deps.log.info({ prId, outcome: 'refused', reason, llm_calls: 0, ...extra }, REFUSED_MSG);
    return error;
  }

  // ---------------------------------------------------------------- facts

  private async collect(workspaceId: string, pull: BriefPull, files: BriefFile[]): Promise<CollectedFacts> {
    const [intent, blast, issues, docs] = await Promise.all([
      this.intentFact(workspaceId, pull),
      this.blastFact(workspaceId, pull.id),
      this.issueFacts(pull),
      this.docFacts(workspaceId, pull.repoId),
    ]);
    const notes: BriefInputNote[] = [...intent.notes, ...blast.notes, ...issues.notes, ...docs.notes];

    const body = stripHtmlComments(pull.body ?? '').trim();
    if (!body) notes.push({ input: 'pr_description', reason: 'empty' });

    const prFiles = new Map<string, LineRange[]>();
    const fileFacts: BriefFileFact[] = files.map((f) => {
      const ranges = changedRanges(f.patch);
      prFiles.set(f.path, ranges);
      return { path: f.path, role: classifyFile(f.path), additions: f.additions, deletions: f.deletions, ranges };
    });

    // Callers (and their lines) only from a usable map: the same map grounds them (AC-53, AC-97).
    const callerLines = blast.value && !blast.value.degraded ? callerLineMap(blast.value) : new Map<string, number[]>();
    return {
      body,
      intent: intent.value,
      blast: blast.value,
      issues: issues.value,
      docs: docs.value,
      files: fileFacts,
      callerFiles: [...callerLines.keys()],
      callerLines,
      grounding: { prFiles, blastFiles: blast.value && !blast.value.degraded ? callerLines : null },
      notes,
    };
  }

  private async intentFact(workspaceId: string, pull: BriefPull): Promise<Fact<PrIntentRecord | null>> {
    let stored: { record: PrIntentRecord } | null;
    try {
      stored = await this.deps.intent.getIntentRecord(workspaceId, pull.id);
    } catch {
      return { value: null, notes: [{ input: 'intent', reason: 'unavailable' }] };
    }
    if (!stored) return { value: null, notes: [{ input: 'intent', reason: 'not_derived' }] };
    const notes: BriefInputNote[] =
      stored.record.head_sha !== pull.headSha ? [{ input: 'intent', reason: 'older_commit' }] : [];
    return { value: stored.record, notes };
  }

  private async blastFact(workspaceId: string, prId: string): Promise<Fact<BlastRadius | null>> {
    let blast: BlastRadius;
    try {
      blast = await this.deps.blast.forPull(workspaceId, prId);
    } catch {
      return { value: null, notes: [{ input: 'blast', reason: 'unavailable' }] };
    }
    const notes: BriefInputNote[] = blast.degraded ? [{ input: 'blast', reason: blast.reason ?? 'unavailable' }] : [];
    return { value: blast, notes };
  }

  /** ≤ `MAX_ISSUES` issues: closing-linked first, then mentioned; own number skipped (AC-64, AC-88). */
  private async issueFacts(pull: BriefPull): Promise<Fact<BriefIssueFact[]>> {
    const notes: BriefInputNote[] = [];
    let github: Awaited<ReturnType<BriefDeps['github']>>;
    try {
      github = await this.deps.github();
    } catch (err) {
      const reason = err instanceof ConfigError ? 'no_github_token' : 'fetch_failed';
      return { value: [], notes: [{ input: 'linked_issues', reason }] };
    }

    const refs = extractRefs({
      title: pull.title,
      body: pull.body,
      branch: pull.branch,
      repo: pull.repo,
      prNumber: pull.number,
    });
    const linked = pull.repo
      ? await github.linkedIssueNumbers(pull.repo, pull.number).catch(() => [] as number[])
      : [];
    const numbers: number[] = [];
    for (const n of [...linked, ...refs.issues.map((i) => i.number)]) {
      if (n !== pull.number && !numbers.includes(n)) numbers.push(n);
    }
    const overCap = refs.unresolved.some((u) => u.kind === 'issue' && u.reason === 'limit_reached');
    for (const n of numbers.slice(MAX_ISSUES)) notes.push({ input: 'linked_issues', reason: 'limit_reached', ref: `#${n}` });
    if (overCap && numbers.length <= MAX_ISSUES) notes.push({ input: 'linked_issues', reason: 'limit_reached' });
    const chosen = numbers.slice(0, MAX_ISSUES);
    if (chosen.length === 0) return { value: [], notes: [...notes, { input: 'linked_issues', reason: 'none_linked' }] };

    const repo = pull.repo;
    const read = await Promise.all(
      chosen.map(async (n): Promise<BriefIssueFact | BriefInputNote> => {
        if (!repo) return { input: 'linked_issues', reason: 'fetch_failed', ref: `#${n}` };
        try {
          const issue = await github.getIssue(repo, n);
          const text = stripHtmlComments(issue.body ?? '').trim();
          return { number: n, title: issue.title, body: text.slice(0, codePointCut(text, ISSUE_MAX_CHARS)) };
        } catch (err) {
          return { input: 'linked_issues', reason: httpStatus(err) === 404 ? 'not_found' : 'fetch_failed', ref: `#${n}` };
        }
      }),
    );
    const issues: BriefIssueFact[] = [];
    for (const r of read) {
      if ('input' in r) notes.push(r);
      else issues.push(r);
    }
    return { value: issues, notes };
  }

  /** The repo's attached Project Context docs; a failing source degrades to a note (AC-65, AC-86). */
  private async docFacts(workspaceId: string, repoId: string): Promise<Fact<BriefDocFact[]>> {
    let docs: Awaited<ReturnType<BriefDeps['docs']['repoDocs']>>;
    try {
      docs = await this.deps.docs.repoDocs(workspaceId, repoId);
    } catch {
      return { value: [], notes: [{ input: 'spec_docs', reason: 'unreadable' }] };
    }
    if (docs.attached.length === 0) return { value: [], notes: [{ input: 'spec_docs', reason: 'none_attached' }] };
    if (!docs.clone) return { value: [], notes: [{ input: 'spec_docs', reason: 'no_clone' }] };
    return {
      value: docs.docs.map((d) => ({ path: d.path, text: d.text })),
      notes: docs.skipped.map((path) => ({ input: 'spec_docs', reason: 'unreadable', ref: path })),
    };
  }
}

interface Fact<T> {
  value: T;
  notes: BriefInputNote[];
}

/** Caller file → sorted, deduped caller lines, in first-seen file order. */
function callerLineMap(blast: BlastRadius): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const d of blast.downstream) {
    for (const c of d.callers) {
      const lines = map.get(c.file) ?? [];
      if (!lines.includes(c.line)) lines.push(c.line);
      map.set(c.file, lines);
    }
  }
  for (const lines of map.values()) lines.sort((a, b) => a - b);
  return map;
}

/**
 * Maps a failed call to its outcome and API error. A schema miss first (its message
 * may quote model text — never carried: no `details`), then timeouts (our race, the
 * SDK's connection timeout), else a provider error with secrets redacted (AC-49, AC-68).
 */
function classifyFailure(err: unknown): { outcome: Exclude<CallOutcome, 'stored'>; error: AppError } {
  const e = err as { name?: unknown; message?: unknown; constructor?: { name?: unknown } } | null;
  const message = typeof e?.message === 'string' ? e.message : String(err);
  const name = typeof e?.name === 'string' ? e.name : '';
  const ctor = typeof e?.constructor?.name === 'string' ? e.constructor.name : '';
  if (/schema validation/i.test(message)) {
    return { outcome: 'invalid', error: new AppError('invalid_brief', 'The model returned an invalid brief', 502) };
  }
  if (
    err instanceof TimeoutError ||
    name === 'TimeoutError' ||
    name === 'APIConnectionTimeoutError' ||
    ctor === 'APIConnectionTimeoutError' ||
    /timed out|timeout/i.test(message)
  ) {
    return {
      outcome: 'timeout',
      error: new AppError('llm_timeout', `The model did not answer within ${LLM_TIMEOUT_MS / 1000} s`, 504),
    };
  }
  return {
    outcome: 'error',
    error: new ExternalServiceError(`The Risk Brief model call failed: ${redactSecrets(message)}`),
  };
}

function httpStatus(err: unknown): number | undefined {
  const status = (err as { status?: unknown })?.status;
  return typeof status === 'number' ? status : undefined;
}

function nonNegInt(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}
