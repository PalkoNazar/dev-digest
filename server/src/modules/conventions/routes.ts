import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ConventionUpdate } from '@devdigest/shared';
import { renderPrompt } from '../../platform/prompts.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import {
  EXTRACT_JOB_KIND,
  EXTRACT_JOB_TIMEOUT_MS,
  MAX_CANDIDATES,
  SYSTEM_PROMPT_TEMPLATE,
} from './constants.js';
import { ConventionsRepository } from './repository.js';
import { ConventionsService } from './service.js';
import { ExtractJobPayload } from './types.js';

/**
 * L02 homework — Conventions Extractor. Spec: specs/L02-conventions-extractor.md
 *   POST  /repos/:id/conventions/extract → start a scan (job) → 202 ConventionScan
 *   GET   /repos/:id/conventions         → { scan, candidates }
 *   PATCH /conventions/:id               → accept / reject / edit / record skill
 * Turning accepted candidates into a skill goes through POST /skills + /agents/:id/skills.
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const service = new ConventionsService({
    repo: new ConventionsRepository(c.db),
    jobs: c.jobs,
    readFile: (repo, path) => c.git.readFile(repo, path).catch(() => null),
    grep: (repo, pattern) => c.codeIndex.grep(repo, pattern),
    rankedFiles: (repoId, n) => c.repoIntel.getConventionSamples(repoId, n),
    testFiles: (repoId, n) => c.repoIntel.getTestSamples(repoId, n),
    llm: (provider) => c.llm(provider),
    systemPrompt: () => renderPrompt(SYSTEM_PROMPT_TEMPLATE, { max: String(MAX_CANDIDATES) }),
  });

  // One paid LLM call per scan: never retried by the runner.
  c.jobs.register(EXTRACT_JOB_KIND, (payload) => service.runScan(ExtractJobPayload.parse(payload)), {
    retries: 0,
    timeoutMs: EXTRACT_JOB_TIMEOUT_MS,
  });

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const { workspaceId } = await getContext(c, req);
      const scan = await service.start(workspaceId, req.params.id);
      reply.status(202);
      return scan;
    },
  );

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(c, req);
    return service.list(workspaceId, req.params.id);
  });

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: ConventionUpdate } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.update(workspaceId, req.params.id, req.body);
    },
  );
}
