import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createHttpApi } from './api/http.js';
import { loadConfig, type McpConfig } from './config.js';
import { buildServer } from './mcp/server.js';

/**
 * Composition root: config → HTTP adapter → MCP server → stdio. stdout carries the protocol
 * only, so every diagnostic goes to stderr.
 */

function logError(message: string): void {
  process.stderr.write(`[devdigest-mcp] ${message}\n`);
}

function errorText(err: unknown): string {
  return err instanceof Error ? (err.stack ?? err.message) : String(err);
}

async function main(): Promise<void> {
  let config: McpConfig;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    logError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const api = createHttpApi({ baseUrl: config.apiUrl });
  const server = buildServer({ api, apiUrl: config.apiUrl });
  await server.connect(new StdioServerTransport());
}

// Tools turn their own errors into `isError`; anything else is logged to stderr, never stdout.
// A stray rejection is not fatal; an uncaught exception leaves the process in an unknown state.
process.on('unhandledRejection', (reason) => logError(`unhandled rejection: ${errorText(reason)}`));
process.on('uncaughtException', (err) => {
  logError(`uncaught exception: ${errorText(err)}`);
  process.exit(1);
});

main().catch((err: unknown) => {
  logError(`failed to start: ${errorText(err)}`);
  process.exit(1);
});
