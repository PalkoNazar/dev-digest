import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toToolMessage } from '../../core/errors.js';
import { getBlastRadius } from '../../core/get-blast-radius.js';
import { fail, ok } from '../results.js';
import type { ServerDeps } from '../server.js';
import { prArg, repoArg } from './args.js';

const DESCRIPTION =
  "Get a PR's blast radius from DevDigest's code index: symbols declared in changed files, " +
  'their callers (file:line) and HTTP endpoints/crons that may break. Call before reviewing or ' +
  'changing shared code. No LLM; reads the existing index.';

export function registerGetBlastRadius(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    'get_blast_radius',
    {
      description: DESCRIPTION,
      inputSchema: { repo: repoArg, pr: prArg },
      // Read-only: the PR is looked up by GET /repos/:id/pulls/:number/blast, which is
      // side-effect free — not via GET /repos/:id/pulls (listPulls), which upserts PRs.
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return ok(await getBlastRadius(deps, args));
      } catch (err) {
        return fail(toToolMessage(err, deps.apiUrl));
      }
    },
  );
}
