import OpenAI from 'openai';
import type {
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { toJsonSchema, parseWithRepair } from './structured.js';

/**
 * The single OpenAI-compatible structured provider, owned by the engine because
 * BOTH consumers need it: the CI runner (the GitHub Action runs reviewer-core
 * directly) and the studio server's openrouter path. Centralizing it here means
 * session grouping, the no-choices guard, request timeouts, and the
 * parse-with-repair loop live in ONE place instead of being duplicated.
 *
 * OpenRouter is OpenAI-compatible, so we drive it with the OpenAI SDK pointed at
 * its baseURL. Only completeStructured is needed by reviewPullRequest; the rest
 * are stubs. Cost attribution is INJECTED (`estimateCost`) so the engine stays
 * free of a pricing table — the server passes its own, the runner passes none.
 */

const NOT_SUPPORTED = 'OpenRouterProvider only implements completeStructured';

/**
 * Default wall-clock budget for one completeStructured call (all attempts, body
 * included). The SDK `timeout` only covers the wait for response HEADERS and is
 * cleared once they arrive — and OpenRouter sends `200` + keep-alive whitespace
 * within ~1 s, then the JSON when generation ends. Without this budget a model
 * that "thinks" for minutes (or a stalled upstream) keeps a review running forever.
 * Large one-pass reviews have legitimately taken ~6.5 min, so the default is generous.
 */
const DEFAULT_CALL_BUDGET_MS = 600_000;

/**
 * Default cap on completion tokens per OpenRouter call when the request sets none.
 * Reasoning tokens count toward it, and it is the only HARD bound: reasoning models
 * (deepseek-v4-flash) sometimes reason for 40k–135k hidden tokens (20–60 min) for a
 * ~700-char answer, and `reasoning.max_tokens` / `effort: low` only lower the effort
 * (measured 2026-10-04). ~24k tokens ≈ 4–6 min at the observed 65–100 tok/s.
 */
const DEFAULT_MAX_TOKENS = 24_000;

/**
 * Share of the call budget a reasoning attempt may use while a retry is still
 * possible. Token caps don't bound TIME: some deepseek-v4-flash endpoints run at
 * ~29 tok/s (103k tokens in 59 min), so 24k tokens can take ~14 min. When the
 * share runs out, the next attempt asks for the answer without reasoning in the
 * time that is left (a 35k-token review prompt answers in ~1–2 min that way).
 */
const REASONING_ATTEMPT_SHARE = 0.6;

export interface OpenRouterProviderOptions {
  /** OpenAI-compatible base URL (default: OpenRouter). */
  baseURL?: string;
  /** Provider id for traces/gating (default 'openrouter'). */
  id?: 'openai' | 'openrouter';
  /** Per-request timeout (ms) — the SDK retries on timeout/5xx/429 with backoff. */
  timeoutMs?: number;
  maxRetries?: number;
  /** Injected cost estimator; returns USD or null when the model is unknown. */
  estimateCost?: (model: string, tokensIn: number, tokensOut: number) => number | null;
}

export class OpenRouterProvider implements LLMProvider {
  readonly id: 'openai' | 'openrouter';
  private client: OpenAI;
  private baseURL: string;
  private apiKey: string;
  private estimateCost?: OpenRouterProviderOptions['estimateCost'];

  constructor(apiKey: string, opts: OpenRouterProviderOptions = {}) {
    this.id = opts.id ?? 'openrouter';
    this.apiKey = apiKey;
    this.baseURL = opts.baseURL ?? 'https://openrouter.ai/api/v1';
    this.estimateCost = opts.estimateCost;
    this.client = new OpenAI({
      apiKey,
      baseURL: this.baseURL,
      timeout: opts.timeoutMs ?? 90_000,
      maxRetries: opts.maxRetries ?? 2,
    });
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const jsonSchema = toJsonSchema(req.schema, req.schemaName);
    const maxRetries = req.maxRetries ?? 2;
    const messages = [...req.messages];
    let tokensIn = 0;
    let tokensOut = 0;
    let costFromApi: number | null = null;
    let lastRaw = '';
    // Per-attempt diagnostics for the final error: routed provider, finish reason and
    // which fields failed — never the model's text (the message reaches logs/UI).
    const failures: string[] = [];
    const budgetMs = req.timeoutMs ?? DEFAULT_CALL_BUDGET_MS;
    const deadline = Date.now() + budgetMs;
    const maxTokens = req.maxTokens ?? (this.id === 'openrouter' ? DEFAULT_MAX_TOKENS : undefined);
    // Set once a reasoning model spent the whole cap thinking: the next attempt
    // asks for the answer without reasoning instead of thinking again.
    let reasoningOff = false;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(
          `OpenRouter call for ${req.schemaName} exceeded its ${budgetMs}ms budget` +
            (failures.length ? ` — ${failures.join('; ')}` : ''),
        );
      }
      // Aborts the request at any stage, including while the body is still being
      // read (which the SDK timeout does not cover).
      // While reasoning is on and a retry is left, this attempt gets only a share of
      // the budget, so the no-reasoning retry still has time to answer.
      const slice =
        this.id === 'openrouter' && !reasoningOff && attempt <= maxRetries
          ? Math.min(remaining, Math.round(budgetMs * REASONING_ATTEMPT_SHARE))
          : remaining;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), slice);
      let res: OpenAI.Chat.Completions.ChatCompletion;
      try {
        res = await this.client.chat.completions.create({
          model: req.model,
          messages,
          temperature: req.temperature ?? 0,
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
          ...(reasoningOff ? { reasoning: { enabled: false } } : {}),
          response_format: {
            type: 'json_schema',
            json_schema: { name: req.schemaName, schema: jsonSchema.schema, strict: true },
          },
          // OpenRouter session grouping — extra body field (spread is exempt from
          // excess-property checks). Only sent when talking to OpenRouter.
          ...(this.id === 'openrouter' && req.sessionId ? { session_id: req.sessionId } : {}),
          // Prefer the fastest endpoints (same model, same price class): slow ones turn a
          // long reasoning pass into a timeout. `require_parameters` routes only to
          // endpoints that honour every parameter (json_schema included).
          ...(this.id === 'openrouter'
            ? { provider: { sort: 'throughput', ...(req.requireParameters ? { require_parameters: true } : {}) } }
            : {}),
          // OpenRouter usage accounting — ask it to return the REAL generation
          // cost (USD) in `usage.cost`, instead of estimating from a price book.
          ...(this.id === 'openrouter' ? { usage: { include: true } } : {}),
        }, { signal: controller.signal });
      } catch (err) {
        if (controller.signal.aborted && slice < remaining) {
          reasoningOff = true;
          failures.push(
            `attempt ${attempt}: no answer within ${slice}ms while reasoning — retrying without reasoning`,
          );
          continue;
        }
        if (controller.signal.aborted) {
          throw new Error(
            `OpenRouter call for ${req.schemaName} timed out after ${budgetMs}ms (attempt ${attempt})`,
          );
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }

      // OpenRouter can return HTTP 200 with no `choices` (an upstream provider
      // error / moderation / free-tier limit in the body) — surface it.
      const choice = res.choices?.[0];
      if (!choice) {
        const errMsg = (res as unknown as { error?: { message?: string } }).error?.message;
        throw new Error(`OpenRouter returned no choices for ${req.schemaName}${errMsg ? `: ${errMsg}` : ''}`);
      }
      lastRaw = choice.message?.content ?? '';
      tokensIn += res.usage?.prompt_tokens ?? 0;
      tokensOut += res.usage?.completion_tokens ?? 0;
      // `usage.cost` is an OpenRouter extension (USD), absent from the OpenAI SDK type.
      const apiCost = (res.usage as { cost?: number } | null | undefined)?.cost;
      if (typeof apiCost === 'number') costFromApi = (costFromApi ?? 0) + apiCost;
      const routed = (res as unknown as { provider?: string }).provider ?? 'unknown';

      // The cap ran out while the model was still reasoning: no answer at all. Retry
      // the same messages with reasoning disabled (no repair reprompt — nothing to repair).
      const reasoningTokens = res.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
      if (choice.finish_reason === 'length' && !lastRaw.trim() && reasoningTokens > 0 && !reasoningOff) {
        reasoningOff = true;
        failures.push(
          `attempt ${attempt}: provider=${routed} reasoning used the whole ${maxTokens}-token cap ` +
            `(${reasoningTokens} reasoning tokens) — retrying without reasoning`,
        );
        continue;
      }

      const parsed = parseWithRepair(req.schema, lastRaw);
      if (parsed.ok) {
        return {
          data: parsed.data,
          model: req.model,
          tokensIn,
          tokensOut,
          costUsd: costFromApi ?? this.estimateCost?.(req.model, tokensIn, tokensOut) ?? null,
          raw: lastRaw,
          attempts: attempt,
        };
      }
      failures.push(
        `attempt ${attempt}: provider=${routed} finish=${choice.finish_reason ?? 'unknown'} ` +
          `out=${res.usage?.completion_tokens ?? '?'} (${parsed.problems.slice(0, 4).join(', ')})`,
      );
      messages.push({ role: 'assistant', content: lastRaw });
      messages.push({ role: 'user', content: parsed.repromptMessage });
    }
    throw new Error(
      `OpenRouter structured output failed schema validation for ${req.schemaName} — ${failures.join('; ')}`,
    );
  }

  /**
   * List models with pricing from the OpenRouter `/models` endpoint (the OpenAI
   * SDK's models.list strips the `pricing` field, so we fetch raw). Prices are
   * converted from per-token to USD per 1M tokens; cheapest output first.
   */
  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${this.baseURL}/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`OpenRouter /models returned ${res.status}`);
    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        name?: string;
        context_length?: number;
        pricing?: { prompt?: string; completion?: string };
      }>;
    };
    const models: ModelInfo[] = (json.data ?? []).map((m) => {
      const prompt = Number(m.pricing?.prompt);
      const completion = Number(m.pricing?.completion);
      // OpenRouter uses -1 as a sentinel for variable-priced router pseudo-models
      // (openrouter/auto etc.) — treat negatives as "unknown" so they don't show
      // as $-1000000 and don't sort to the top of the cheapest list.
      const pricing =
        Number.isFinite(prompt) && Number.isFinite(completion) && prompt >= 0 && completion >= 0
          ? { promptPerM: prompt * 1_000_000, completionPerM: completion * 1_000_000 }
          : null;
      return {
        id: m.id,
        provider: 'openrouter' as const,
        label: m.name ?? null,
        pricing,
        contextLength: m.context_length ?? null,
      };
    });
    return models.sort(
      (a, b) => (a.pricing?.completionPerM ?? Infinity) - (b.pricing?.completionPerM ?? Infinity),
    );
  }
  async complete(_req: CompletionRequest): Promise<CompletionResult> {
    throw new Error(NOT_SUPPORTED);
  }
  async embed(_texts: string[]): Promise<number[][]> {
    throw new Error(NOT_SUPPORTED);
  }
}
