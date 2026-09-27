# client/src/lib

API access and app-wide client state.

## Rules
- Every server call goes `hook (lib/hooks/<domain>.ts)` → `api.get/post/…` (`api.ts`).
  Components never call `fetch` directly.
- Errors are `ApiError { status, code, details }` (`status: 0` = API unreachable);
  branch on `status`/`code`, don't parse messages.
- User feedback on mutations via `notify` (`toast.tsx`).
- Invalidate the affected `queryKey`s after a mutation; keep key shapes consistent
  within a domain file.

## Gotchas
- `apiFetch` only sets `content-type: application/json` when a body is sent —
  Fastify rejects body-less POSTs that declare JSON.
- Live Log uses SSE (`EventSource` on `${API_BASE}/runs/:id/events`) in
  `hooks/reviews.ts`; active runs are re-read from the server so they survive reloads.
