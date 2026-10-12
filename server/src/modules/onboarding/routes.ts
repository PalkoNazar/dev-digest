import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { renderPrompt } from '../../platform/prompts.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import {
  GENERATE_JOB_KIND,
  GENERATE_JOB_TIMEOUT_MS,
  SYSTEM_PROMPT_TEMPLATE,
} from './constants.js';
import { OnboardingRepository } from './repository.js';
import { OnboardingService } from './service.js';
import { GenerateJobPayload } from './types.js';

/**
 * L05 Onboarding Tour. Spec: specs/L05-onboarding-tour.md (SPEC-02)
 *   GET  /repos/:id/onboarding           → OnboardingView (reads only, AC-32)
 *   POST /repos/:id/onboarding/generate  → start a generation (job) → 202 OnboardingGeneration
 * The only module file that reads `app.container`.
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const service = new OnboardingService({
    repo: new OnboardingRepository(c.db),
    intel: c.repoIntel,
    git: c.git,
    jobs: c.jobs,
    llm: (provider) => c.llm(provider),
    systemPrompt: () => renderPrompt(SYSTEM_PROMPT_TEMPLATE, { language: 'English' }),
    countTokens: (text) => c.tokenizer.count(text),
    indexEnabled: c.config.repoIntelEnabled,
    log: app.log,
  });

  // One paid LLM call per generation: never retried by the runner.
  c.jobs.register(GENERATE_JOB_KIND, (payload) => service.run(GenerateJobPayload.parse(payload)), {
    retries: 0,
    timeoutMs: GENERATE_JOB_TIMEOUT_MS,
  });

  app.get('/repos/:id/onboarding', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(c, req);
    return service.view(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/onboarding/generate',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const { workspaceId } = await getContext(c, req);
      const generation = await service.start(workspaceId, req.params.id);
      reply.status(202);
      return generation;
    },
  );
}
