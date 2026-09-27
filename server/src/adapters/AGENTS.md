# server/adapters

Implementations of the ports declared in `@devdigest/shared` (`adapters.ts`):
LLM, GitHub, git, code index, embedder, secrets, auth, plus repo-intel helpers
(astgrep, depgraph, tokenizer).

## Rules
- Each adapter implements a shared interface; services depend on the interface only.
- Wire it in `../platform/container.ts` (lazy getter + optional override).
- Every new adapter gets a mock in `mocks.ts` so unit tests stay hermetic and key-free.
- LLM adapters get structured output from `../platform/structured.ts` (Zod → JSON Schema,
  parse-with-repair) — don't hand-roll JSON parsing.

## Gotchas
- The OpenRouter provider is NOT here — it lives in `reviewer-core/src/llm/openrouter.ts`.
- `embedder/openai.ts` is gated by `EMBEDDINGS_ENABLED` (off → zero OpenAI calls).
- `secrets/local.ts` is the only reader of `~/.devdigest/secrets.json` (0600);
  `GITHUB_TOKEN` is canonical, `GITHUB_PAT` is a fallback.
- `auth/local.ts` is a no-auth stub: always the default workspace + system user.
