# Examples — bad vs good entries

Test for every entry: "if it's obvious to anyone reading the code, don't write it".
A good entry is actionable cold: a new session knows what to do without the chat history.

## Tool & Library Notes
❌ `Promises can be tricky.` — noise, not a lesson.
✅
```
### 2026-03-24 — ingest pipeline: batch with allSettled
NEVER use Promise.all() on the ingest pipeline — it times out after ~30 items.
Why: one slow item stalls the batch. Use Promise.allSettled() in batches of 10.
```
(source: MindStudio, learnings-md-wrap-up)

## What Doesn't Work
❌ `Be careful with the webhook.`
✅
```
### 2026-04-02 — webhook 404 still carries data
NEVER branch on response.ok for the delivery webhook.
Why: it returns 404 with a valid body. Evidence: parse the body, check `body.status`.
```
(source: dev.to/evoleinik)

## Codebase Patterns (this repo)
❌ `Remember to refresh caches.`
✅
```
### 2026-09-27 — saving a key needs a cache flush
ALWAYS call `container.invalidateSecretCaches()` after writing a secret.
Why: LLM/GitHub clients are cached in the container; without it the old key keeps being used.
Evidence: `POST /settings/test-connection`, `server/src/platform/container.ts`.
```

❌ `Aliases are configured in the client.`
✅
```
### 2026-09-27 — aliases are declared twice
ALWAYS add a new alias to both `client/tsconfig.json` AND `client/vitest.config.ts`.
Why: adding it to one only breaks either typecheck or tests.
```

## Contradicting an older entry (old one stays untouched)
```
### 2026-10-05 — prompts are copied by build now
Supersedes: "`src/prompts` is not copied by `build`" (2026-09-27)
Do rely on `pnpm build && pnpm start` — build now copies `src/prompts` to `dist/`.
Why/Evidence: `server/package.json` build script.
```

## Open Questions
✅
```
### 2026-09-27 — SSE stream drops after ~60s idle?
Seen once in dev on the review stream; not reproduced. Check proxy/keep-alive before assuming a server bug.
```
