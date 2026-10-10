import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { BlastRadius } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastRepository } from './repository.js';
import { BlastService } from './service.js';

/**
 * L04 homework — Blast radius. Spec: specs/L04-blast-radius.md
 *   GET /pulls/:id/blast                 → BlastRadius of a PR by id (UI)
 *   GET /repos/:id/pulls/:number/blast   → same map by repo + PR number (MCP)
 * Both read the repo-intel index only: no LLM, no re-parse, no writes.
 */
const RepoPullNumberParams = z.object({
  id: z.string().uuid(),
  number: z.coerce.number().int().positive(),
});

export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const service = new BlastService({
    repo: new BlastRepository(c.db),
    source: c.repoIntel,
  });

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadius } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.forPull(workspaceId, req.params.id, req.log);
    },
  );

  app.get(
    '/repos/:id/pulls/:number/blast',
    { schema: { params: RepoPullNumberParams, response: { 200: BlastRadius } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.forPullNumber(workspaceId, req.params.id, req.params.number, req.log);
    },
  );
}
