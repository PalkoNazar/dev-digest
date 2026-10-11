# INSIGHTS — reviewer-core

Append-only log of non-obvious things learned while working here: what surprised
us, why something broke, what the code doesn't say. Newest on top.

- Format: `## YYYY-MM-DD — short title` + 1–3 lines + file paths.
- If Claude trips over the same insight twice → promote it to a one-line Gotcha in
  the nearest `AGENTS.md` and mark the entry `(promoted)`.
- Stale entry → strike it through with a note, don't delete silently.

---
<!-- engineering-insights: new entries go into the sections below. The rules above
     ("Newest on top", top-level ## entries) apply only to the entries above this line. -->

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

### 2026-10-11 — fast SDK-retry tests: answer 5xx with `retry-after-ms`
Do send header `retry-after-ms: '1'` on 5xx replies in local-`http` tests that count OpenAI SDK retries.
Why: the SDK honours it, so retried requests fire in milliseconds instead of the default backoff, and the retry count is unchanged. Evidence: `test/openrouter-timeout.test.ts` ("transportRetries: 0 …"), whole file ~1.1 s.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
