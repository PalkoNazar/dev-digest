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

/** Token caps don't bound time on slow endpoints: a reasoning attempt gets a share of the budget. */
describe('OpenRouterProvider reasoning time slice', () => {
  let server: Server | undefined;
  afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

  it('cuts a slow reasoning attempt and answers without reasoning within the budget', async () => {
    const bodies: Record<string, unknown>[] = [];
    const baseURL = await new Promise<string>((resolve) => {
      server = createServer((req, res) => {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
          bodies.push(JSON.parse(raw) as Record<string, unknown>);
          res.writeHead(200, { 'content-type': 'application/json' });
          if (bodies.length === 1) {
            // first attempt: keep-alive whitespace, never the body (a slow reasoning pass)
            const tick = setInterval(() => res.write(' '), 50);
            res.on('close', () => clearInterval(tick));
            return;
          }
          res.end(
            JSON.stringify({
              id: 'x', object: 'chat.completion', created: 0, model: 'm',
              choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{"ok":true}' } }],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }),
          );
        });
      });
      server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server!.address() as AddressInfo).port}/v1`));
    });
    const t0 = Date.now();
    const out = await new OpenRouterProvider('test-key', { baseURL, maxRetries: 0 }).completeStructured({
      model: 'm',
      schema: z.object({ ok: z.boolean() }),
      schemaName: 'Probe',
      messages: [{ role: 'user', content: 'x' }],
      maxRetries: 2,
      timeoutMs: 1_000,
    });
    expect(out.data).toEqual({ ok: true });
    expect(out.attempts).toBe(2);
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(bodies[0]!.reasoning).toBeUndefined();
    expect(bodies[0]!.provider).toEqual({ sort: 'throughput' });
    expect(bodies[1]!.reasoning).toEqual({ enabled: false });
  });
});

/**
 * SPEC-02 (L05 onboarding tour) — per-request transport controls (S2, R2/R3, A12).
 * One generation = at most one LLM call (AC-31, AC-88): `transportRetries` overrides
 * the SDK's constructor-level `maxRetries` for that request. A reasoning model must not
 * spend the 4,000-token output cap thinking (AC-87): `reasoning: 'off'` disables it from
 * attempt 1 — on OpenRouter only.
 */
describe('OpenRouterProvider per-request transport controls', () => {
  let server: Server | undefined;
  afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

  type Mode = 'error500' | 'ok';
  function recording(mode: Mode): Promise<{ baseURL: string; bodies: Record<string, unknown>[] }> {
    const bodies: Record<string, unknown>[] = [];
    return new Promise((resolve) => {
      server = createServer((req, res) => {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
          bodies.push(JSON.parse(raw) as Record<string, unknown>);
          if (mode === 'error500') {
            // `retry-after-ms` keeps SDK retries (if any) fast; it doesn't change their count.
            res.writeHead(500, { 'content-type': 'application/json', 'retry-after-ms': '1' });
            res.end(JSON.stringify({ error: { message: 'upstream exploded' } }));
            return;
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              id: 'x', object: 'chat.completion', created: 0, model: 'm',
              choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{"ok":true}' } }],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }),
          );
        });
      });
      server.listen(0, '127.0.0.1', () => {
        resolve({ baseURL: `http://127.0.0.1:${(server!.address() as AddressInfo).port}/v1`, bodies });
      });
    });
  }

  const probe = {
    model: 'm',
    schema: z.object({ ok: z.boolean() }),
    schemaName: 'Probe',
    messages: [{ role: 'user' as const, content: 'x' }],
  };

  it('transportRetries: 0 makes exactly one HTTP request on a 500, even with the SDK default retries', async () => {
    const { baseURL, bodies } = await recording('error500');
    // No constructor maxRetries: the SDK default (2) applies unless the request overrides it.
    const llm = new OpenRouterProvider('test-key', { baseURL });
    await expect(
      llm.completeStructured({ ...probe, maxRetries: 0, transportRetries: 0, timeoutMs: 10_000 }),
    ).rejects.toThrow();
    expect(bodies).toHaveLength(1);
  });

  it('without transportRetries the constructor-level SDK retries still apply (request unchanged)', async () => {
    const { baseURL, bodies } = await recording('error500');
    const llm = new OpenRouterProvider('test-key', { baseURL, maxRetries: 1 });
    await expect(llm.completeStructured({ ...probe, maxRetries: 0, timeoutMs: 10_000 })).rejects.toThrow();
    expect(bodies).toHaveLength(2);
  });

  it("reasoning: 'off' sends reasoning {enabled:false} on the FIRST request", async () => {
    const { baseURL, bodies } = await recording('ok');
    const out = await new OpenRouterProvider('test-key', { baseURL, maxRetries: 0 }).completeStructured({
      ...probe,
      maxRetries: 0,
      reasoning: 'off',
    });
    expect(out.data).toEqual({ ok: true });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.reasoning).toEqual({ enabled: false });
  });

  it('without reasoning/transportRetries the first body has no reasoning key', async () => {
    const { baseURL, bodies } = await recording('ok');
    await new OpenRouterProvider('test-key', { baseURL, maxRetries: 0 }).completeStructured({
      ...probe,
      maxRetries: 0,
    });
    expect(bodies).toHaveLength(1);
    expect('reasoning' in bodies[0]!).toBe(false);
  });

  it("reasoning: 'off' is not sent to a non-OpenRouter endpoint (id 'openai')", async () => {
    const { baseURL, bodies } = await recording('ok');
    await new OpenRouterProvider('test-key', { baseURL, id: 'openai', maxRetries: 0 }).completeStructured({
      ...probe,
      maxRetries: 0,
      reasoning: 'off',
    });
    expect(bodies).toHaveLength(1);
    expect('reasoning' in bodies[0]!).toBe(false);
  });
});
