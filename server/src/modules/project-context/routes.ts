import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ContextAttachInput, ContextAttachments, SpecFile } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * L05 Project Context. Spec: specs/L05-project-context.md
 *   GET /repos/:id/context              → SpecFile[] (every Markdown doc of the repo)
 *   GET /repos/:id/context/file?path=   → SpecFile with content
 *   GET|PUT /agents/:id/context         → ContextAttachments (?repo_id= / body)
 *   GET|PUT /skills/:id/context         → ContextAttachments
 * The service is `container.projectContext` (also used by review runs).
 */
const DocPathQuery = z.object({ path: z.string().min(1).max(1024) });
const RepoIdQuery = z.object({ repo_id: z.string().uuid() });

export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const service = c.projectContext;

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: z.array(SpecFile) } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.listDocs(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context/file',
    { schema: { params: IdParams, querystring: DocPathQuery, response: { 200: SpecFile } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.readDoc(workspaceId, req.params.id, req.query.path);
    },
  );

  app.get(
    '/agents/:id/context',
    { schema: { params: IdParams, querystring: RepoIdQuery, response: { 200: ContextAttachments } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.agentView(workspaceId, req.params.id, req.query.repo_id);
    },
  );

  app.put(
    '/agents/:id/context',
    { schema: { params: IdParams, body: ContextAttachInput, response: { 200: ContextAttachments } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.setAgentDocs(workspaceId, req.params.id, req.body.repo_id, req.body.paths);
    },
  );

  app.get(
    '/skills/:id/context',
    { schema: { params: IdParams, querystring: RepoIdQuery, response: { 200: ContextAttachments } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.skillView(workspaceId, req.params.id, req.query.repo_id);
    },
  );

  app.put(
    '/skills/:id/context',
    { schema: { params: IdParams, body: ContextAttachInput, response: { 200: ContextAttachments } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.setSkillDocs(workspaceId, req.params.id, req.body.repo_id, req.body.paths);
    },
  );
}
