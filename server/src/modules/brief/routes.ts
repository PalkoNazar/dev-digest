import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBriefResponse } from '@devdigest/shared';
import { renderPrompt } from '../../platform/prompts.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import {
  MAX_FOCUS,
  MAX_RISKS,
  REASON_MAX_CHARS,
  SUMMARY_MAX_CHARS,
  SYSTEM_PROMPT_TEMPLATE,
  TITLE_MAX_CHARS,
} from './constants.js';
import { BriefRepository } from './repository.js';
import { BriefService } from './service.js';

/**
 * L05 PR Why + Risk Brief. Spec: specs/L05-pr-brief.md (SPEC-03)
 *   GET  /pulls/:id/brief → PrBriefResponse from the cache only (no model call)
 *   POST /pulls/:id/brief → generate synchronously (one model call), store, return
 * The only module file that reads `app.container`; other modules' data comes in
 * through ports (`reviewRepo`, `blast`, `projectContext`).
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const service = new BriefService({
    repo: new BriefRepository(c.db),
    intent: c.reviewRepo,
    blast: c.blast,
    docs: c.projectContext,
    github: () => c.github(),
    llm: (provider) => c.llm(provider),
    systemPrompt: () =>
      renderPrompt(SYSTEM_PROMPT_TEMPLATE, {
        max_risks: String(MAX_RISKS),
        max_focus: String(MAX_FOCUS),
        summary_chars: String(SUMMARY_MAX_CHARS),
        title_chars: String(TITLE_MAX_CHARS),
        reason_chars: String(REASON_MAX_CHARS),
      }),
    log: app.log,
  });

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.generate(workspaceId, req.params.id);
    },
  );
}
