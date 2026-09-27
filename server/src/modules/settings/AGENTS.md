# modules/settings

Workspace settings (key/value rows), secrets status, per-feature model choice.

## Rules
- Secrets are written through `container.secrets` (→ `~/.devdigest/secrets.json`),
  never into the `settings` table. `GET /settings/secrets-status` returns only booleans.
- System LLM features resolve their model via `feature-models.ts`: workspace override,
  else the `FEATURE_MODELS` registry default from `@devdigest/shared`.

## Gotchas
- Keys are saved by `POST /settings/test-connection` (BYO key), not `PUT /settings`.
- The container caches LLM/GitHub clients per key → after writing a secret call
  `container.invalidateSecretCaches()`, or the old key keeps being used.
