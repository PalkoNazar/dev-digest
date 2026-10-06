/**
 * Error taxonomy of the MCP server. The adapter throws the `Api*` errors, use cases throw
 * `ToolError` (already phrased for the model). `toToolMessage` turns any of them into the one
 * line a tool returns as `isError`, always naming the next step.
 */

/** The API could not be reached (connection refused, DNS, timeout). */
export class ApiUnreachableError extends Error {
  constructor(
    public readonly url: string,
    public readonly reason: 'unreachable' | 'timeout' = 'unreachable',
  ) {
    super(`DevDigest API ${reason === 'timeout' ? 'timed out' : 'is not reachable'} at ${url}`);
    this.name = 'ApiUnreachableError';
  }
}

/** The API answered with a non-2xx status (`{ error: { code, message } }` envelope). */
export class ApiHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiHttpError';
  }
}

/** The API answered 2xx but the body did not match the expected contract. */
export class ApiShapeError extends Error {
  constructor(public readonly route: string) {
    super(`Unexpected response from DevDigest API for ${route}`);
    this.name = 'ApiShapeError';
  }
}

/** A use-case failure whose message is already the final, actionable tool text. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

/** Longest API-provided message echoed into a tool error. */
const MAX_DETAIL_CHARS = 200;

/** Collapses whitespace and caps length so an error stays one short line. */
function oneLine(text: string, max = MAX_DETAIL_CHARS): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** One-line tool error text with the next step, for any error a use case can throw. */
export function toToolMessage(err: unknown, apiUrl: string): string {
  if (err instanceof ToolError) return oneLine(err.message, 500);
  if (err instanceof ApiUnreachableError) {
    if (err.reason === 'timeout') {
      return (
        `DevDigest API at ${apiUrl} did not respond in time — ` +
        'check that it is running (./scripts/dev.sh) and retry'
      );
    }
    return `DevDigest API is not reachable at ${apiUrl} — start it with ./scripts/dev.sh`;
  }
  if (err instanceof ApiHttpError) {
    const detail = oneLine(err.message);
    if (err.status === 429) {
      return `DevDigest API rate limit hit (${detail}) — wait a minute, then retry`;
    }
    if (err.code === 'config_error') {
      return `DevDigest is not configured: ${detail} — add the key or model in DevDigest Settings`;
    }
    return `DevDigest API error ${err.status} ${err.code}: ${detail}`;
  }
  if (err instanceof ApiShapeError) {
    return `${err.message} — the API and mcp/ may be out of sync; update both to the same commit`;
  }
  const message = err instanceof Error ? err.message : String(err);
  return `Unexpected error in the DevDigest MCP server: ${oneLine(message)}`;
}
