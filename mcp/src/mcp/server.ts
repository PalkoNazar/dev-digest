import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SERVER_INSTRUCTIONS } from '../core/constants.js';
import type { DevDigestApi } from '../core/port.js';
import type { WaitTiming } from '../core/wait-for-run.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerRunAgentOnPr } from './tools/run-agent-on-pr.js';

export interface ServerDeps {
  /** The DevDigest API port (HTTP adapter in production, a fake in tests). */
  api: DevDigestApi;
  /** Named in "API unreachable" errors. */
  apiUrl: string;
  /** Poll-loop timing override for `run_agent_on_pr` (tests). */
  wait?: WaitTiming;
}

export const SERVER_NAME = 'devdigest';
export const SERVER_VERSION = '0.0.0';

/** The MCP server: instructions + five tools. No resources, no prompts. */
export function buildServer(deps: ServerDeps): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );
  registerListAgents(server, deps);
  registerRunAgentOnPr(server, deps);
  registerGetFindings(server, deps);
  registerGetConventions(server, deps);
  registerGetBlastRadius(server);
  return server;
}
