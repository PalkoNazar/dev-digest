# e2e — `@devdigest/e2e`

Deterministic browser flows via the agent-browser CLI. No Playwright, no LLM, no keys.

## Commands (npm, not pnpm)
- Recommended: `./scripts/e2e.sh` from the repo root — isolated freshly-seeded stack
  on Postgres :5433 / API :3101 / web :3100, torn down afterwards.
- Against a running stack: `npm test` (only if the dev DB holds ONLY the seeded repo).
- One-time: `npm i -g agent-browser && agent-browser install`

## Conventions
- A flow = `specs/NN-name.flow.json`: ordered agent-browser commands; `{BASE}` is
  replaced with `E2E_BASE_URL`. `wait --text` / `wait --url` ARE the assertions.
- Deterministic locators only (`--url`, `--text`, `find role|text|label`);
  never the AI `chat` command.
- Flows use read-only seeded data (`acme/payments-api`, PR #482, built-in agents)
  and must never trigger a model call.

## Gotchas
- Flows 02/04/05 follow the home redirect to the FIRST repo → fail on a dev DB with
  other imported repos. Use the hermetic runner.
- UI text changes (`client/messages/en/*.json`) can break `wait --text` steps.
- Never `docker compose down -v` to "reset" — it wipes the dev data volume.

## Docs
`README.md` · deep dives: `docs/` · learned: `INSIGHTS.md`
(`specs/` here = flow files; feature specs for e2e work live in `/specs/`.)
