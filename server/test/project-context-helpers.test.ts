import { describe, it, expect } from 'vitest';
import type { GitTreeEntry } from '@devdigest/shared';
import {
  buildAgentRows,
  buildSkillRows,
  categoryOf,
  discoverDocs,
  effectiveDocList,
  estTokens,
  fitDocs,
  usedByCounts,
} from '../src/modules/project-context/helpers.js';
import {
  MAX_DOC_CHARS,
  MAX_TOTAL_CHARS,
  truncationMarker,
} from '../src/modules/project-context/constants.js';

/**
 * L05 — pure core of Project Context (plan S5): document discovery over a git
 * tree listing, categories, the effective list, the 20k/60k limits, Context-tab
 * rows and used-by counts.
 */

const blob = (path: string, size = 10): GitTreeEntry => ({ path, mode: '100644', size });
const link = (path: string): GitTreeEntry => ({ path, mode: '120000', size: 9 });

/** Link texts by link path, as `git show HEAD:<link>` returns them. */
const LINKS: Record<string, string> = {
  'CLAUDE.md': 'README.md',
  'docs/CLAUDE.md': '../README.md',
  'escape.md': '../../etc/passwd',
  'abs.md': '/etc/hosts',
  'chain.md': 'CLAUDE.md',
  'dangling.md': 'nope.md',
};
const readLink = (p: string): string | null => LINKS[p] ?? null;

async function discoveredPaths(entries: GitTreeEntry[]): Promise<string[]> {
  const docs = await discoverDocs(entries, readLink);
  return docs.map((d) => d.path).sort();
}

describe('discoverDocs', () => {
  it('drops files under an excluded folder at any depth (AC-1, EC-1)', async () => {
    const paths = await discoveredPaths([
      blob('README.md'),
      blob('docs/a.md'),
      blob('node_modules/x/y.md'),
      blob('packages/app/node_modules/z.md'),
      blob('client/src/vendor/shared/r.md'),
      blob('dist/d.md'),
      blob('build/b.md'),
      blob('coverage/c.md'),
      blob('web/.next/n.md'),
      blob('out/o.md'),
      blob('.git/x.md'),
      blob('outdoc/kept.md'),
    ]);
    expect(paths).toEqual(['README.md', 'docs/a.md', 'outdoc/kept.md']);
  });

  it('keeps only .md files, case-insensitively, regular or executable blobs', async () => {
    const paths = await discoveredPaths([
      blob('docs/a.md'),
      { path: 'docs/run.MD', mode: '100755', size: 3 },
      blob('src/index.ts'),
      blob('docs/notes.txt'),
      blob('docs/md'),
    ]);
    expect(paths).toEqual(['docs/a.md', 'docs/run.MD']);
  });

  it('keeps an in-tree symlink, drops outside/absolute/chained/dangling links and submodules (Q1=A, AC-41)', async () => {
    const paths = await discoveredPaths([
      blob('README.md'),
      link('CLAUDE.md'),
      link('docs/CLAUDE.md'),
      link('escape.md'),
      link('abs.md'),
      link('chain.md'),
      link('dangling.md'),
      { path: 'libs/sub.md', mode: '160000', size: null },
    ]);
    expect(paths).toEqual(['CLAUDE.md', 'README.md', 'docs/CLAUDE.md']);
  });
});

describe('categoryOf', () => {
  it('is the top-level folder, or "root" at the repo root (AC-2)', () => {
    expect(categoryOf('README.md')).toBe('root');
    expect(categoryOf('specs/a.md')).toBe('specs');
    expect(categoryOf('docs/deep/x.md')).toBe('docs');
  });
});

describe('estTokens', () => {
  it('is ceil(chars / 4)', () => {
    expect(estTokens(0)).toBe(0);
    expect(estTokens(1)).toBe(1);
    expect(estTokens(4)).toBe(1);
    expect(estTokens(5)).toBe(2);
  });
});

describe('effectiveDocList', () => {
  it('own paths first, then skill paths in skill order, each once at its first position (AC-30, EC-7)', () => {
    const list = effectiveDocList(
      ['b.md', 'a.md'],
      [
        { name: 'Sec', paths: ['a.md', 'c.md'] },
        { name: 'Perf', paths: ['c.md', 'd.md'] },
      ],
    );
    expect(list).toEqual([
      { path: 'b.md', own: true, via: [] },
      { path: 'a.md', own: true, via: ['Sec'] },
      { path: 'c.md', own: false, via: ['Sec', 'Perf'] },
      { path: 'd.md', own: false, via: ['Perf'] },
    ]);
  });
});

describe('fitDocs', () => {
  const doc = (path: string, chars: number) => ({ path, text: 'x'.repeat(chars) });

  it('limits are 20,000 per document and 60,000 in total', () => {
    expect(MAX_DOC_CHARS).toBe(20_000);
    expect(MAX_TOTAL_CHARS).toBe(60_000);
  });

  it('truncates a 25k document to its first 20k characters plus a visible marker (AC-36)', () => {
    const text = 'a'.repeat(20_000) + 'b'.repeat(5_000);
    const { injected, omitted } = fitDocs([{ path: 'docs/big.md', text }]);
    expect(omitted).toEqual([]);
    expect(injected).toHaveLength(1);
    expect(injected[0]!.truncated).toBe(true);
    expect(injected[0]!.text).toBe('a'.repeat(20_000) + truncationMarker(25_000));
    expect(truncationMarker(25_000)).toContain('truncated by DevDigest');
  });

  it('a document of exactly 20k is not truncated', () => {
    const { injected } = fitDocs([doc('a.md', 20_000)]);
    expect(injected[0]).toEqual({ path: 'a.md', text: 'x'.repeat(20_000), truncated: false });
  });

  it('[30k, 20k, 15k, 10k] keeps three documents and omits the last (AC-37)', () => {
    const { injected, omitted } = fitDocs([
      doc('a.md', 30_000),
      doc('b.md', 20_000),
      doc('c.md', 15_000),
      doc('d.md', 10_000),
    ]);
    expect(injected.map((d) => d.path)).toEqual(['a.md', 'b.md', 'c.md']);
    expect(injected.map((d) => d.truncated)).toEqual([true, false, false]);
    expect(omitted).toEqual(['d.md']);
  });

  it('reports several omitted documents in list order', () => {
    const { injected, omitted } = fitDocs([
      doc('a.md', 20_000),
      doc('b.md', 20_000),
      doc('c.md', 20_000),
      doc('d.md', 1_000),
      doc('e.md', 2_000),
    ]);
    expect(injected.map((d) => d.path)).toEqual(['a.md', 'b.md', 'c.md']);
    expect(omitted).toEqual(['d.md', 'e.md']);
  });

  it('exactly three truncated 20k documents fit: the marker is not counted (Q2)', () => {
    const { injected, omitted } = fitDocs([
      doc('a.md', 25_000),
      doc('b.md', 25_000),
      doc('c.md', 25_000),
    ]);
    expect(injected.map((d) => d.path)).toEqual(['a.md', 'b.md', 'c.md']);
    expect(injected.every((d) => d.truncated)).toBe(true);
    expect(omitted).toEqual([]);
  });

  it('never cuts an astral character in half at the 20k boundary: the text stays well-formed (AC-36, B1)', () => {
    // '😀' is two UTF-16 code units; its high surrogate sits at index 19,999.
    const text = 'a'.repeat(19_999) + '😀' + 'b'.repeat(100);
    const { injected } = fitDocs([{ path: 'docs/emoji.md', text }]);
    expect(injected).toHaveLength(1);
    const out = injected[0]!;
    expect(out.truncated).toBe(true);
    expect(out.text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(out.text).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    expect(out.text.endsWith(truncationMarker(text.length))).toBe(true);
  });
});

describe('Context-tab rows', () => {
  // listed in a shuffled order on purpose
  const TREE = [
    blob('specs/c.md'),
    blob('notes.md'),
    blob('docs/z.md'),
    blob('specs/a.md'),
    blob('docs/b.md'),
  ];
  const SKILLS = [{ name: 'Sec', paths: ['docs/z.md', 'specs/a.md'] }];

  it('agent rows: effective rows in prompt order (attached/missing/inherited), then the rest alphabetically (AC-16, AC-21, AC-42, AC-46)', async () => {
    const discovered = await discoverDocs(TREE, readLink);
    const own = ['specs/a.md', 'gone.md'];
    const rows = buildAgentRows(discovered, own, effectiveDocList(own, SKILLS));
    expect(rows.map((r) => ({ path: r.path, state: r.state, via: r.via }))).toEqual([
      { path: 'specs/a.md', state: 'attached', via: ['Sec'] },
      { path: 'gone.md', state: 'missing', via: [] },
      { path: 'docs/z.md', state: 'inherited', via: ['Sec'] },
      { path: 'docs/b.md', state: 'available', via: [] },
      { path: 'notes.md', state: 'available', via: [] },
      { path: 'specs/c.md', state: 'available', via: [] },
    ]);
    expect(rows.find((r) => r.path === 'specs/a.md')?.category).toBe('specs');
    expect(rows.find((r) => r.path === 'notes.md')?.category).toBe('root');
  });

  it('after the own attachment is removed, a skill document becomes an inherited row (AC-47)', async () => {
    const discovered = await discoverDocs(TREE, readLink);
    const rows = buildAgentRows(discovered, [], effectiveDocList([], SKILLS));
    expect(rows.find((r) => r.path === 'specs/a.md')).toMatchObject({
      state: 'inherited',
      via: ['Sec'],
    });
    expect(rows.filter((r) => r.path === 'specs/a.md')).toHaveLength(1);
    expect(rows.map((r) => r.path).slice(0, 2)).toEqual(['docs/z.md', 'specs/a.md']);
  });

  it('skill rows: own (attached/missing) in order, then the rest alphabetically, never inherited', async () => {
    const discovered = await discoverDocs(TREE, readLink);
    const rows = buildSkillRows(discovered, ['specs/c.md', 'gone.md']);
    expect(rows.map((r) => ({ path: r.path, state: r.state }))).toEqual([
      { path: 'specs/c.md', state: 'attached' },
      { path: 'gone.md', state: 'missing' },
      { path: 'docs/b.md', state: 'available' },
      { path: 'docs/z.md', state: 'available' },
      { path: 'notes.md', state: 'available' },
      { path: 'specs/a.md', state: 'available' },
    ]);
  });
});

describe('usedByCounts', () => {
  it('counts, per path, the agents whose effective list contains it (AC-5)', () => {
    const counts = usedByCounts([['a.md', 'b.md'], ['a.md'], []]);
    expect(counts.get('a.md')).toBe(2);
    expect(counts.get('b.md')).toBe(1);
    expect(counts.get('c.md') ?? 0).toBe(0);
  });
});
