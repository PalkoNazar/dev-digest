import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect } from './helpers/harness.js';

/**
 * Token budgets of what Claude Code loads: instructions are always in context, the tool list
 * when tools are searched. A failing budget ⇒ shorten the text, never raise the limit.
 */
const MAX_TOOLS_LIST_CHARS = 6_000;
const MAX_INSTRUCTIONS_CHARS = 400;
const MAX_DESCRIPTION_CHARS = 300;

const READ_TOOLS = ['list_agents', 'get_findings', 'get_conventions', 'get_blast_radius'];

let harness: Awaited<ReturnType<typeof connect>>;
let tools: Tool[];
let listJson: string;

beforeAll(async () => {
  harness = await connect();
  const list = await harness.client.listTools();
  tools = list.tools;
  listJson = JSON.stringify(list);
});

afterAll(async () => {
  await harness.close();
});

function tool(name: string): Tool {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`tool ${name} not registered`);
  return found;
}

describe('tool surface', () => {
  it('exactly the five tools', () => {
    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_blast_radius',
      'get_conventions',
      'get_findings',
      'list_agents',
      'run_agent_on_pr',
    ]);
  });

  it(`tools/list ≤ ${MAX_TOOLS_LIST_CHARS} chars`, () => {
    expect(listJson.length).toBeLessThanOrEqual(MAX_TOOLS_LIST_CHARS);
  });

  it(`instructions ≤ ${MAX_INSTRUCTIONS_CHARS} chars and name the PR address + how to start`, () => {
    const instructions = harness.client.getInstructions() ?? '';
    expect(instructions.length).toBeGreaterThan(0);
    expect(instructions.length).toBeLessThanOrEqual(MAX_INSTRUCTIONS_CHARS);
    expect(instructions).toContain('owner/name');
    expect(instructions).toContain('./scripts/dev.sh');
  });

  it(`every description ≤ ${MAX_DESCRIPTION_CHARS} chars`, () => {
    for (const t of tools) {
      expect(t.description?.length ?? 0, t.name).toBeGreaterThan(0);
      expect(t.description?.length ?? 0, t.name).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS);
    }
  });

  it('pure read tools are readOnlyHint: true', () => {
    for (const name of READ_TOOLS.filter((n) => n !== 'get_findings')) {
      expect(tool(name).annotations, name).toMatchObject({ readOnlyHint: true });
    }
  });

  it('get_findings is not read-only (PR resolution syncs the local DB) but idempotent', () => {
    expect(tool('get_findings').annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
  });

  it('run_agent_on_pr is a non-destructive, non-idempotent, open-world write', () => {
    expect(tool('run_agent_on_pr').annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
  });

  it('input schemas are flat: primitive properties only', () => {
    for (const t of tools) {
      const properties = (t.inputSchema.properties ?? {}) as Record<string, Record<string, unknown>>;
      for (const [key, prop] of Object.entries(properties)) {
        expect(['string', 'integer', 'number', 'boolean'], `${t.name}.${key}`).toContain(prop.type);
        for (const nested of ['properties', 'items', '$ref', 'anyOf', 'oneOf', 'allOf']) {
          expect(prop, `${t.name}.${key}`).not.toHaveProperty(nested);
        }
      }
    }
  });

  it('no outputSchema on any tool', () => {
    for (const t of tools) expect(t, t.name).not.toHaveProperty('outputSchema');
  });

  it('only the tools capability: no resources, no prompts', () => {
    const capabilities = harness.client.getServerCapabilities() ?? {};
    expect(capabilities).toHaveProperty('tools');
    expect(capabilities).not.toHaveProperty('resources');
    expect(capabilities).not.toHaveProperty('prompts');
  });

  it('get_blast_radius is read-only and closed-world (side-effect-free number route)', () => {
    expect(tool('get_blast_radius').annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
    });
    expect(tool('get_blast_radius').description).toMatch(/^Get a PR's blast radius/);
  });
});
