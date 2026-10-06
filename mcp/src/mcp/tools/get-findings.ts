import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// 'zod/v3', not 'zod': see args.ts.
import { z } from 'zod/v3';
import { toToolMessage } from '../../core/errors.js';
import { getFindings } from '../../core/get-findings.js';
import { fail, ok } from '../results.js';
import type { ServerDeps } from '../server.js';
import { prArg, repoArg } from './args.js';

const DESCRIPTION =
  'Get the verdict and findings of DevDigest reviews already run on a PR: latest review per ' +
  'agent, or one run via run_id. Concise by default (WARNING+, 20 items); detail="full" adds ' +
  'rationale and suggestion. Does not start a review.';

export function registerGetFindings(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    'get_findings',
    {
      description: DESCRIPTION,
      inputSchema: {
        repo: repoArg,
        pr: prArg,
        agent: z.string().min(1).optional().describe('Only this agent (name or id)'),
        run_id: z.string().min(1).optional().describe('One run, e.g. from run_agent_on_pr'),
        min_severity: z
          .enum(['CRITICAL', 'WARNING', 'SUGGESTION'])
          .optional()
          .describe('Lowest severity to include (default WARNING)'),
        detail: z.enum(['concise', 'full']).optional(),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Max findings per review (default 20)'),
      },
      // Open world: resolving the PR hits GET /repos/:id/pulls, which may sync from GitHub.
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        return ok(await getFindings(deps, args));
      } catch (err) {
        return fail(toToolMessage(err, deps.apiUrl));
      }
    },
  );
}
