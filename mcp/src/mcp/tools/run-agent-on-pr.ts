import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// 'zod/v3', not 'zod': see args.ts.
import { z } from 'zod/v3';
import { toToolMessage } from '../../core/errors.js';
import { runAgentOnPr } from '../../core/run-agent-on-pr.js';
import { fail, ok } from '../results.js';
import type { ServerDeps } from '../server.js';
import { prArg, repoArg } from './args.js';

const DESCRIPTION =
  'Run one DevDigest reviewer agent on an imported PR, wait until it finishes (can take ' +
  'minutes, paid LLM call) and return its verdict, score and findings. The only tool that ' +
  'writes. For an existing review use get_findings instead.';

export function registerRunAgentOnPr(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    'run_agent_on_pr',
    {
      description: DESCRIPTION,
      inputSchema: {
        repo: repoArg,
        pr: prArg,
        agent: z.string().min(1).describe('Agent name or id from list_agents'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      // Progress only when the client asked for it (sent a token); a failed send is ignored.
      const progressToken = extra._meta?.progressToken;
      const onProgress =
        progressToken === undefined
          ? undefined
          : (elapsedMs: number) => {
              const seconds = Math.round(elapsedMs / 1000);
              extra
                .sendNotification({
                  method: 'notifications/progress',
                  params: {
                    progressToken,
                    progress: elapsedMs,
                    message: `Review still running (${seconds}s)`,
                  },
                })
                .catch(() => undefined);
            };
      try {
        const wait = { ...deps.wait, signal: extra.signal, onProgress };
        return ok(await runAgentOnPr(deps, args, wait));
      } catch (err) {
        return fail(toToolMessage(err, deps.apiUrl));
      }
    },
  );
}
