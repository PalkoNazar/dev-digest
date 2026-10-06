import { z } from 'zod';

export interface McpConfig {
  /** DevDigest API origin, no trailing slash. */
  apiUrl: string;
}

export const DEFAULT_API_URL = 'http://localhost:3001';

const ApiUrl = z
  .string()
  .url()
  // zod 3 still runs a refine after `.url()` failed, so guard the `new URL` call.
  .refine((value) => URL.canParse(value) && /^https?:$/.test(new URL(value).protocol), {
    message: 'must be an http(s) URL',
  });

/** Reads the config from an env map. Only `DEVDIGEST_API_URL`; no secrets. Throws on a bad URL. */
export function loadConfig(env: Record<string, string | undefined>): McpConfig {
  const raw = env.DEVDIGEST_API_URL?.trim() || DEFAULT_API_URL;
  const parsed = ApiUrl.safeParse(raw);
  if (!parsed.success) {
    const reason = parsed.error.issues[0]?.message ?? 'invalid URL';
    throw new Error(`Invalid DEVDIGEST_API_URL "${raw}": ${reason}`);
  }
  return { apiUrl: parsed.data.replace(/\/+$/, '') };
}
