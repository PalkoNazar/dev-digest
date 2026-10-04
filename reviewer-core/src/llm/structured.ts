import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

/**
 * structured-output helpers shared by both LLM providers.
 *
 * - `toJsonSchema` converts a Zod schema to a JSON Schema (draft-07, strict
 *   object) by reusing OpenAI's bundled converter — used for OpenAI's
 *   `response_format: json_schema` AND Anthropic forced tool-use `input_schema`.
 * - `parseWithRepair` validates raw model text against the Zod schema and, on
 *   failure, returns a reprompt instruction so the caller can retry-on-error.
 */

export interface JsonSchema {
  schema: Record<string, unknown>;
  name: string;
}

export function toJsonSchema<T>(schema: z.ZodType<T>, name: string): JsonSchema {
  const rf = zodResponseFormat(schema as z.ZodTypeAny, name);
  return { schema: inlineDefinitions(rf.json_schema.schema as Record<string, unknown>), name };
}

/**
 * Replace `{ $ref: '#/definitions/X' }` with a copy of `definitions.X` and drop
 * `definitions`. The converter emits refs for reused sub-schemas; Gemini (Google
 * via OpenRouter) rejects them ("reference to undefined schema"), OpenAI and
 * Anthropic accept the inlined form too. Our contracts are not recursive; a
 * self-referencing definition is left as a ref rather than expanded forever.
 */
export function inlineDefinitions(root: Record<string, unknown>): Record<string, unknown> {
  const defs = (root.definitions ?? {}) as Record<string, unknown>;
  if (Object.keys(defs).length === 0) return root;
  const PREFIX = '#/definitions/';
  const walk = (node: unknown, seen: ReadonlySet<string>): unknown => {
    if (Array.isArray(node)) return node.map((n) => walk(n, seen));
    if (!node || typeof node !== 'object') return node;
    const obj = node as Record<string, unknown>;
    const ref = obj.$ref;
    if (typeof ref === 'string' && ref.startsWith(PREFIX)) {
      const key = ref.slice(PREFIX.length);
      if (key in defs && !seen.has(key)) return walk(defs[key], new Set([...seen, key]));
      return obj;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k !== 'definitions') out[k] = walk(v, seen);
    }
    return out;
  };
  return walk(root, new Set()) as Record<string, unknown>;
}

/** Best-effort extraction of a JSON object/array from a model's text output. */
export function extractJson(text: string): string {
  const trimmed = text.trim();
  // strip ```json fences
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  // find first balanced { … } or [ … ]
  const firstObj = trimmed.indexOf('{');
  const firstArr = trimmed.indexOf('[');
  const start =
    firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
  if (start === -1) return trimmed;
  const open = trimmed[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = start; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
  }
  return trimmed.slice(start);
}

export type ParseResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      repromptMessage: string;
      /** Content-free failure summary (`not valid JSON` or `<path>: <zod code>`), safe to log. */
      problems: string[];
    };

export function parseWithRepair<T>(schema: z.ZodType<T>, raw: string): ParseResult<T> {
  let parsedJson: unknown;
  try {
    // Strict json_schema mode returns pure JSON — parse it directly. Only fall
    // back to fence/brace extraction if that fails, because extractJson can be
    // fooled by ``` fences or `{` braces that appear INSIDE JSON string values
    // (e.g. markdown code blocks in an onboarding `body`).
    try {
      parsedJson = JSON.parse(raw.trim());
    } catch {
      parsedJson = JSON.parse(extractJson(raw));
    }
  } catch (e) {
    const msg = `Output was not valid JSON: ${(e as Error).message}`;
    return {
      ok: false,
      error: msg,
      repromptMessage: `${msg}\nReturn ONLY a single valid JSON object matching the schema, no prose.`,
      problems: ['not valid JSON'],
    };
  }
  const result = schema.safeParse(parsedJson);
  if (result.success) return { ok: true, data: result.data };
  const issues = result.error.issues
    .map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  return {
    ok: false,
    error: issues,
    repromptMessage: `Your JSON did not match the required schema. Fix these and return ONLY valid JSON:\n${issues}`,
    problems: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.code}`),
  };
}
