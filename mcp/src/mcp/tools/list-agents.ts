import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toToolMessage } from '../../core/errors.js';
import { listAgents } from '../../core/list-agents.js';
import { fail, ok } from '../results.js';
import type { ServerDeps } from '../server.js';

const DESCRIPTION =
  'List the reviewer agents configured in DevDigest (id, name, model, enabled). Call this first ' +
  'to get a valid agent name or id for run_agent_on_pr / get_findings.';

export function registerListAgents(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    'list_agents',
    {
      description: DESCRIPTION,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        return ok(await listAgents(deps));
      } catch (err) {
        return fail(toToolMessage(err, deps.apiUrl));
      }
    },
  );
}
