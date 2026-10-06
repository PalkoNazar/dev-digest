import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fail } from '../results.js';
import { prArg, repoArg } from './args.js';

const DESCRIPTION =
  'Not available yet: will return the impact map of a PR (changed symbols and downstream ' +
  'files). Currently always returns an error — do not rely on it.';

/** Stub: reserves the name and schema; no use case, no API call. */
export function registerGetBlastRadius(server: McpServer): void {
  server.registerTool(
    'get_blast_radius',
    {
      description: DESCRIPTION,
      inputSchema: { repo: repoArg, pr: prArg },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => fail('Blast radius is not implemented yet in DevDigest.'),
  );
}
