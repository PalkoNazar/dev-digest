# Fastify: the delivery ring

Fastify is a *driving adapter*: it turns HTTP into calls on the application core and the
core's results/errors back into HTTP. Nothing inside the core knows it exists.

## A module = one encapsulated plugin

- `modules/<m>/routes.ts` default-exports `async function (appBase: FastifyInstance)`.
  It is registered once, statically, in `modules/index.ts` (no autoload; see
  `server/src/modules/AGENTS.md`). `modules/index.ts` is imported only by `app.ts`.
- Fastify's `register` creates an encapsulated child context (a DAG of plugins). Use that
  for module-local hooks/decorators; don't reach into another module's plugin.
- `app.container` (decorated once in `app.ts`) is the bridge from Fastify to the
  composition root. **Only `routes.ts` reads it.** Build the service at plugin start:

```ts
export default async function reposRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const service = new RepoService({
    repo: new RepoRepository(c.db),       // module-local repository: wired here
    git: c.git,                            // shared port: taken from the container
    jobs: c.jobs,                          // JobRunner satisfies the JobQueue port
    github: () => c.github(),              // lazy: throws ConfigError when no token
  });
  c.jobs.register(CLONE_JOB, (payload) => service.clone(ClonePayload.parse(payload)));
  // …routes
}
```

- Don't use `fastify.decorate` to hang services on the instance for other modules to pull
  — that is a second service locator. Cross-module sharing goes through a port on the
  container.

## Handler shape

```ts
app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
  const { workspaceId, userId } = await getContext(app.container, req);   // 1. tenancy
  const { repo, created } = await service.add(workspaceId, userId, req.body.url); // 2. ONE use case
  reply.status(created ? 201 : 200);                                        // 3. HTTP shape
  return repo;
});
```

- Schemas: `params`/`querystring`/`body` (and `response` where it helps) come from
  `@devdigest/shared` or `_shared/schemas.ts` (`IdParams`). Validation failures become
  422 in the global handler. Never `Schema.parse(req.body)` by hand.
- Pass plain values into the service (`workspaceId`, `req.body.url`), never `req`/`reply`.
- Status codes and headers are the route's job; the domain decides *what happened*
  (e.g. `created: boolean`), the route decides *how to say it in HTTP*.

## Errors

- The core throws `AppError` subclasses from `platform/errors.ts` (`NotFoundError`,
  `ValidationError`, `ConfigError`, `ExternalServiceError`). `app.setErrorHandler` in
  `app.ts` turns them into `{ error: { code, message, details } }`.
- Routes don't `try/catch` just to translate errors. Catch only to *degrade* on a read
  path (local-first: missing GitHub token → empty/partial result), and prefer doing that
  in the service so it is unit-testable.
- `AppError` carries a `statusCode` — a pragmatic leak of HTTP into the core that we
  accept (one small file, no Fastify import). Don't add more HTTP concepts to the core.

## SSE (Live Log)

`fastify-sse-v2` streaming stays in `routes.ts`. The route subscribes to `runBus` and
writes events; the use case only *emits* through a narrow port (see `adapters-di.md`).

## Plugins and cross-cutting concerns

helmet, cors, rate-limit, error handler, container decoration are registered in `app.ts`
before modules. A new cross-cutting concern (auth hook, request id) is a plugin there,
not code copied into handlers.

## Sources
- [Fastify: Plugins](https://fastify.dev/docs/latest/Reference/Plugins/) ·
  [Plugins Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) ·
  [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) ·
  [Decorators](https://fastify.dev/docs/latest/Reference/Decorators/)
- [Luxlorys/fastify-clean-template](https://github.com/Luxlorys/fastify-clean-template)
- [Snyk: Fastify plugins as building blocks](https://snyk.io/blog/fastify-plugins-for-backend-node-js-api/)
