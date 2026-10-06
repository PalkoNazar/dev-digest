import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { buildServer, type ServerDeps } from '../../src/mcp/server.js';
import { FakeApi } from './fake-api.js';

export const API_URL = 'http://localhost:3001';

/** Instant poll loop: no real waiting, a fake clock that advances by each sleep. */
export function fakeClock(): Pick<NonNullable<ServerDeps['wait']>, 'now' | 'sleep'> {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
  };
}

/** `buildServer` + an SDK `Client`, linked in memory (no process, no stdio). */
export async function connect(options: { api?: FakeApi; wait?: ServerDeps['wait'] } = {}) {
  const api = options.api ?? new FakeApi();
  const server = buildServer({ api, apiUrl: API_URL, wait: options.wait ?? fakeClock() });
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    api,
    client,
    server,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

/** The single text block of a tool result. */
export function textOf(result: unknown): string {
  const { content } = result as CallToolResult;
  expectOneText(content);
  const [block] = content;
  return block?.type === 'text' ? block.text : '';
}

function expectOneText(content: CallToolResult['content']): void {
  if (content.length !== 1 || content[0]?.type !== 'text') {
    throw new Error(`expected one text block, got ${JSON.stringify(content)}`);
  }
}
