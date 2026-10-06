import type { DevDigestApi } from './port.js';
import type { AgentView } from './views.js';

export interface ListAgentsResult {
  agents: AgentView[];
}

/** Reviewer agents with only the fields a model needs to pick one (no prompts). */
export async function listAgents(deps: {
  api: Pick<DevDigestApi, 'listAgents'>;
}): Promise<ListAgentsResult> {
  const agents = await deps.api.listAgents();
  return {
    agents: agents.map(({ id, name, model, enabled }) => ({ id, name, model, enabled })),
  };
}
