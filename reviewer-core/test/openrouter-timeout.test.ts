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

/**
 * Reasoning models can spend the whole completion cap thinking (deepseek-v4-flash:
 * 40k–135k hidden tokens for a ~700-char answer). The provider caps every call and,
 * when the cap ran out with no answer, retries once with reasoning disabled.
 */
describe('OpenRouterProvider reasoning cap', () => {
  let server: Server | undefined;
  afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

  type Reply = { content: string; finish: string; reasoning: number };
  function scripted(replies: Reply[]): Promise<{ baseURL: string; bodies: Record<string, unknown>[] }> {
    const bodies: Record<string, unknown>[] = [];
    return new Promise((resolve) => {
      server = createServer((req, res) => {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
          bodies.push(JSON.parse(raw) as Record<string, unknown>);
          const r = replies[Math.min(bodies.length - 1, replies.length - 1)]!;
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              id: 'x',
              object: 'chat.completion',
              created: 0,
              model: 'm',
              provider: 'P',
              choices: [{ index: 0, finish_reason: r.finish, message: { role: 'assistant', content: r.content } }],
              usage: {
                prompt_tokens: 10,
                completion_tokens: r.reasoning + r.content.length,
                total_tokens: 0,
                completion_tokens_details: { reasoning_tokens: r.reasoning },
              },
            }),
          );
        });
      });
      server.listen(0, '127.0.0.1', () => {
        resolve({ baseURL: `http://127.0.0.1:${(server!.address() as AddressInfo).port}/v1`, bodies });
      });
    });
  }

  const call = (baseURL: string) =>
    new OpenRouterProvider('test-key', { baseURL, maxRetries: 0 }).completeStructured({
      model: 'm',
      schema: z.object({ ok: z.boolean() }),
      schemaName: 'Probe',
      messages: [{ role: 'user', content: 'x' }],
      maxRetries: 2,
    });

  it('caps max_tokens and retries without reasoning when the cap ran out mid-reasoning', async () => {
    const { baseURL, bodies } = await scripted([
      { content: '', finish: 'length', reasoning: 24_000 },
      { content: '{"ok":true}', finish: 'stop', reasoning: 0 },
    ]);
    const out = await call(baseURL);
    expect(out.data).toEqual({ ok: true });
    expect(out.attempts).toBe(2);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]!.max_tokens).toBe(24_000);
    expect(bodies[0]!.reasoning).toBeUndefined();
    expect(bodies[1]!.reasoning).toEqual({ enabled: false });
    // same messages — no repair reprompt for an empty answer
    expect(bodies[1]!.messages).toEqual(bodies[0]!.messages);
  });

  it('keeps reasoning on for a truncated answer from a non-reasoning model', async () => {
    const { baseURL, bodies } = await scripted([
      { content: '{"ok":', finish: 'length', reasoning: 0 },
      { content: '{"ok":true}', finish: 'stop', reasoning: 0 },
    ]);
    await call(baseURL);
    expect(bodies[1]!.reasoning).toBeUndefined();
    expect((bodies[1]!.messages as unknown[]).length).toBeGreaterThan((bodies[0]!.messages as unknown[]).length);
  });
});
