import { describe, it, expect } from 'vitest';
import { isLoopbackHost, loadConfig } from '../src/platform/config.js';

const env = (extra: Record<string, string> = {}) =>
  ({ NODE_ENV: 'test', ...extra }) as NodeJS.ProcessEnv;

describe('config: bind host', () => {
  it('defaults to loopback — the API has no auth', () => {
    expect(loadConfig(env()).host).toBe('localhost');
    // `.env.example` ships `HOST=` style empties for other vars; '' falls back too.
    expect(loadConfig(env({ HOST: '' })).host).toBe('localhost');
  });

  it('honours an explicit HOST', () => {
    expect(loadConfig(env({ HOST: '0.0.0.0' })).host).toBe('0.0.0.0');
  });

  it('isLoopbackHost: only local addresses count as loopback', () => {
    for (const h of ['localhost', 'LOCALHOST', '127.0.0.1', '::1']) {
      expect(isLoopbackHost(h)).toBe(true);
    }
    for (const h of ['0.0.0.0', '::', '192.168.1.10']) {
      expect(isLoopbackHost(h)).toBe(false);
    }
  });
});
