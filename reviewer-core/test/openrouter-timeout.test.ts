import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/index.js';

/**
 * OpenRouter answers non-streaming calls with `200` + keep-alive whitespace right
 * away and sends the JSON only when generation ends. The OpenAI SDK `timeout` is
 * cleared once headers arrive, so the call budget must also cover the body.
 */
describe('OpenRouterProvider call budget', () => {
  let server: Server | undefined;
  afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

  function stallAfterHeaders(): Promise<string> {
    return new Promise((resolve) => {
      server = createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.write('\n         \n'); // keep-alive, then never the body
        const tick = setInterval(() => res.write(' '), 50);
        res.on('close', () => clearInterval(tick));
      });
      server.listen(0, '127.0.0.1', () => {
        resolve(`http://127.0.0.1:${(server!.address() as AddressInfo).port}/v1`);
      });
    });
  }

  it('aborts a response whose headers arrived but whose body never finishes', async () => {
    const baseURL = await stallAfterHeaders();
    // SDK header timeout far above the budget: only the call budget can stop this.
    const llm = new OpenRouterProvider('test-key', { baseURL, timeoutMs: 60_000, maxRetries: 0 });
    const t0 = Date.now();
    await expect(
      llm.completeStructured({
        model: 'm',
        schema: z.object({ ok: z.boolean() }),
        schemaName: 'Probe',
        messages: [{ role: 'user', content: 'x' }],
        maxRetries: 0,
        timeoutMs: 300,
      }),
    ).rejects.toThrow(/timed out after 300ms/);
    expect(Date.now() - t0).toBeLessThan(5_000);
  });
});
