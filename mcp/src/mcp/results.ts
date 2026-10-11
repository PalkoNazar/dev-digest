import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** A tool result: one minified-JSON text block (no `structuredContent`). */
export function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

/** A tool error the model can act on: one line, `isError`. */
export function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}
