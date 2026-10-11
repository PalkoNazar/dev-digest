import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { textOf } from './helpers/harness.js';
import { agentDto, pullDto, repoDto, reviewDto } from './helpers/fixtures.js';

/**
 * The real entry (`src/index.ts` via tsx) over real stdio against a fake DevDigest API on
 * `node:http`: proves the composition root, that stdout carries only the protocol, and that the
 * process survives the API going away.
 */

const MCP_DIR = path.resolve(__dirname, '..');
const TSX_CLI = path.join(MCP_DIR, 'node_modules/tsx/dist/cli.mjs');

const ROUTES: Record<string, unknown> = {
  '/agents': [agentDto()],
  '/repos': [repoDto()],
  '/repos/repo-1/pulls': [pullDto()],
  '/pulls/pr-1/reviews': [reviewDto()],
};

let api: Server;
let apiUrl: string;
let client: Client;
let stderr = '';
/** Transport/protocol errors, e.g. a non-JSON line on the server's stdout. */
const protocolErrors: Error[] = [];

beforeAll(async () => {
  api = createServer((req, res) => {
    const body = ROUTES[req.url ?? ''];
    res.writeHead(body === undefined ? 404 : 200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify(body ?? { error: { code: 'not_found', message: 'Not found', details: null } }),
    );
  });
  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
  apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [TSX_CLI, 'src/index.ts'],
    cwd: MCP_DIR,
    env: { DEVDIGEST_API_URL: apiUrl },
    stderr: 'pipe',
  });
  transport.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  client = new Client({ name: 'stdio-test', version: '0.0.0' });
  client.onerror = (err) => protocolErrors.push(err);
  await client.connect(transport);
}, 30_000);

afterAll(async () => {
  await client?.close();
  await new Promise<void>((resolve) => (api?.listening ? api.close(() => resolve()) : resolve()));
});

describe('stdio entry', () => {
  it('initializes with the instructions and lists the five tools', async () => {
    expect(client.getInstructions()).toContain('./scripts/dev.sh');
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(5);
  });

  it('calls tools against the API', async () => {
    const agents = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(JSON.parse(textOf(agents))).toEqual({
      agents: [{ id: 'agent-1', name: 'Security Reviewer', model: 'gpt-4.1-mini', enabled: true }],
    });
    const findings = await client.callTool({
      name: 'get_findings',
      arguments: { repo: 'acme/shop', pr: 42 },
    });
    expect(findings.isError).toBeFalsy();
    expect(JSON.parse(textOf(findings)).reviews).toHaveLength(1);
  });

  it('API down → isError naming the URL, and the process keeps serving', async () => {
    api.closeAllConnections();
    await new Promise<void>((resolve) => api.close(() => resolve()));

    const down = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(down.isError).toBe(true);
    expect(textOf(down)).toBe(
      `DevDigest API is not reachable at ${apiUrl} — start it with ./scripts/dev.sh`,
    );
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(5);
    expect(stderr).not.toMatch(/uncaught|unhandled/);
  });

  it('nothing but protocol messages on stdout', () => {
    expect(protocolErrors).toEqual([]);
  });
});
