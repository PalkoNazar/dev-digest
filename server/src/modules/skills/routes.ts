import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SkillCreate, SkillImportRequest, SkillUpdate } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SkillsService } from './service.js';
import { SkillsRepository } from './repository.js';

/**
 * L02 — skills module.
 *   GET    /skills                  → list (workspace-scoped)
 *   GET    /skills/:id              → one skill
 *   POST   /skills                  → create (manual or confirmed import)
 *   PUT    /skills/:id              → update; a body change bumps the version
 *   DELETE /skills/:id              → delete (agent links cascade)
 *   GET    /skills/:id/versions     → body history, newest first
 *   POST   /skills/import/preview   → parse a .md/.zip upload; stores nothing
 * Linking skills to agents lives on the agent: /agents/:id/skills.
 */

// base64 of the 1 MB import cap, plus JSON overhead.
const IMPORT_BODY_LIMIT = 1.5 * 1024 * 1024;

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService({ repo: new SkillsRepository(app.container.db) });

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.params.id);
  });

  app.post('/skills', { schema: { body: SkillCreate } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: SkillUpdate } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.update(workspaceId, req.params.id, req.body);
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.versions(workspaceId, req.params.id);
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.delete(workspaceId, req.params.id);
    return { ok: true };
  });

  app.post(
    '/skills/import/preview',
    { schema: { body: SkillImportRequest }, bodyLimit: IMPORT_BODY_LIMIT },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.previewImport(workspaceId, req.body.filename, req.body.content_base64);
    },
  );
}
