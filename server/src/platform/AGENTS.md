# server/platform

Cross-cutting runtime: the DI container (composition root), jobs, SSE, errors, config.

## Key files
- `container.ts` — builds every adapter lazily; `ContainerOverrides` is the test seam.
  New adapter/repository → add a getter here, never `new` it inside a module.
- `jobs.ts` — `JobRunner`: p-queue (concurrency 3, 120s timeout, 2 retries) mirrored
  into the `jobs` table. Handlers register by kind (`jobs.register`), modules `enqueue`.
- `sse.ts` — `runBus`: in-memory per-run event buffer + cancel flags for Live Log.
- `run-logger.ts` / `trace-builder.ts` — fan-out logging into runBus + persisted trace.
- `errors.ts` — `AppError` family → structured error envelope.

## Gotchas
- `runBus` is a module-level singleton, shared by every Container (incl. tests).
- runBus state is lost on restart; `../app.ts` reaps orphaned `running` agent_runs on boot.
- `grounding.ts`, `prompt.ts`, `structured.ts` are re-export shims of reviewer-core —
  change the logic in `reviewer-core/src`, not here.
- `model-router.ts` / `price-book.ts` are kept for later lessons (cost badge, L01).
