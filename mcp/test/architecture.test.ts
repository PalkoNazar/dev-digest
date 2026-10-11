import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The ring table of `mcp/` (plan: Architecture), checked on the source text:
 * core = domain + use cases, api = HTTP adapter, mcp = MCP delivery edge,
 * index.ts = composition root.
 */

const SRC = path.resolve(__dirname, '../src');
const SDK = '@modelcontextprotocol/sdk';

interface SourceFile {
  /** Relative to `src/`, with `/` separators. */
  rel: string;
  text: string;
  /** Import specifiers; relative ones resolved to a `src/`-relative `.ts` path. */
  imports: string[];
}

function listTs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTs(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/** `import … from '…'` / `export … from '…'` (multi-line too) and dynamic `import('…')`. */
const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function load(full: string): SourceFile {
  const text = readFileSync(full, 'utf8');
  const imports = [...text.matchAll(IMPORT_RE)].map((m) => {
    const spec = m[1] ?? m[2] ?? '';
    if (!spec.startsWith('.')) return spec;
    const resolved = path.resolve(path.dirname(full), spec).replace(/\.js$/, '.ts');
    return path.relative(SRC, resolved).split(path.sep).join('/');
  });
  return { rel: path.relative(SRC, full).split(path.sep).join('/'), text, imports };
}

const files = listTs(SRC).map(load);
const inRing = (ring: string) => files.filter((f) => f.rel.startsWith(`${ring}/`));

function offenders(
  list: SourceFile[],
  bad: (spec: string) => boolean,
): Array<{ file: string; import: string }> {
  return list.flatMap((f) => f.imports.filter(bad).map((spec) => ({ file: f.rel, import: spec })));
}

describe('ring rules', () => {
  it('finds the rings', () => {
    expect(inRing('core').length).toBeGreaterThan(0);
    expect(inRing('api').length).toBeGreaterThan(0);
    expect(inRing('mcp').length).toBeGreaterThan(0);
    expect(files.map((f) => f.rel)).toContain('index.ts');
  });

  it('core/** imports no MCP SDK, adapter, edge, config or node I/O', () => {
    const bad = (spec: string) =>
      spec.startsWith(SDK) ||
      spec.startsWith('api/') ||
      spec.startsWith('mcp/') ||
      spec === 'config.ts' ||
      spec === 'index.ts' ||
      /^node:(http|https|net|child_process|fs)/.test(spec);
    expect(offenders(inRing('core'), bad)).toEqual([]);
  });

  it('core/** reads no process.env and makes no fetch calls', () => {
    const hits = inRing('core').filter((f) => /process\.env|\bfetch\(/.test(f.text));
    expect(hits.map((f) => f.rel)).toEqual([]);
  });

  it('api/** imports neither the edge nor the MCP SDK', () => {
    const bad = (spec: string) => spec.startsWith(SDK) || spec.startsWith('mcp/');
    expect(offenders(inRing('api'), bad)).toEqual([]);
  });

  it('mcp/** never imports the adapter (it is injected) and reads no process.env', () => {
    expect(offenders(inRing('mcp'), (spec) => spec.startsWith('api/'))).toEqual([]);
    expect(inRing('mcp').filter((f) => f.text.includes('process.env')).map((f) => f.rel)).toEqual(
      [],
    );
  });

  it('only index.ts imports api/http and config', () => {
    const bad = (spec: string) => spec === 'api/http.ts' || spec === 'config.ts';
    const outside = files.filter((f) => f.rel !== 'index.ts');
    expect(offenders(outside, bad)).toEqual([]);
  });

  it('a tool handler calls at most one core use case', () => {
    const helpers = new Set(['core/errors.ts', 'core/constants.ts', 'core/port.ts']);
    for (const f of inRing('mcp/tools')) {
      const useCases = f.imports.filter((spec) => spec.startsWith('core/') && !helpers.has(spec));
      expect(useCases.length, f.rel).toBeLessThanOrEqual(1);
    }
  });
});

describe('stdout is the protocol', () => {
  it('no console.log / console.info / process.stdout.write in src/', () => {
    const hits = files.filter((f) =>
      /console\.log\(|console\.info\(|process\.stdout\.write/.test(f.text),
    );
    expect(hits.map((f) => f.rel)).toEqual([]);
  });
});
