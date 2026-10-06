import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// 'zod/v3', not 'zod': see args.ts.
import { z } from 'zod/v3';
import { toToolMessage } from '../../core/errors.js';
import { getConventions } from '../../core/get-conventions.js';
import { fail, ok } from '../results.js';
import type { ServerDeps } from '../server.js';
import { repoArg } from './args.js';

const DESCRIPTION =
  "Get a repo's coding conventions extracted by DevDigest (category, rule, example file). " +
  "Accepted rules by default. Use them to check or write code in the repo's house style.";

export function registerGetConventions(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    'get_conventions',
    {
      description: DESCRIPTION,
      inputSchema: {
        repo: repoArg,
        status: z.enum(['accepted', 'pending', 'rejected']).optional(),
        limit: z.number().int().positive().optional().describe('Max rules (default 20)'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return ok(await getConventions(deps, args));
      } catch (err) {
        return fail(toToolMessage(err, deps.apiUrl));
      }
    },
  );
}
