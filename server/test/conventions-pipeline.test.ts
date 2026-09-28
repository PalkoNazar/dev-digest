import { describe, it, expect } from 'vitest';
import type { CodeMatch } from '@devdigest/shared';
import {
  bucketOf,
  configCandidatePaths,
  normalizePath,
  numberLines,
  stratify,
} from '../src/modules/conventions/pipeline/sampling.js';
import { verifyEvidence } from '../src/modules/conventions/pipeline/evidence.js';
import {
  isLowAdherence,
  isSafePattern,
  measureAdherence,
  scoreConfidence,
} from '../src/modules/conventions/pipeline/adherence.js';
import {
  matchTooling,
  parseJsonc,
  toolingFacts,
  toolingLabels,
} from '../src/modules/conventions/pipeline/tooling.js';
import { normalizeRule, refineCandidates } from '../src/modules/conventions/pipeline/refine.js';
import type { ExtractedConvention } from '../src/modules/conventions/types.js';

const FILE = [
  "import { NotFoundError } from '../../platform/errors.js';",
  '',
  'export async function load(id: string) {',
  '  const row = await repo.find(id);',
  "  if (!row) throw new NotFoundError('missing');",
  '  return row;',
  '}',
].join('\n');

const files = new Map([['server/src/a.ts', FILE]]);

describe('sampling', () => {
  it('buckets by top folder and layer', () => {
    expect(bucketOf('server/src/modules/x/routes.ts')).toBe('server:api');
    expect(bucketOf('server/src/modules/x/service.ts')).toBe('server:service');
    expect(bucketOf('server/src/modules/x/repository.ts')).toBe('server:data');
    expect(bucketOf('client/src/app/Page.tsx')).toBe('client:ui');
    expect(bucketOf('client/src/lib/hooks/useThing.ts')).toBe('client:hooks');
    expect(bucketOf('README.ts')).toBe('.:other');
  });

  it('stratifies round-robin across buckets, keeping rank order inside each', () => {
    const ranked = [
      'server/src/a/service.ts',
      'server/src/b/service.ts',
      'server/src/c/service.ts',
      'server/src/a/routes.ts',
      'client/src/app/Page.tsx',
    ];
    expect(stratify(ranked, 4)).toEqual([
      'server/src/a/service.ts',
      'server/src/a/routes.ts',
      'client/src/app/Page.tsx',
      'server/src/b/service.ts',
    ]);
    expect(stratify(ranked, 10)).toHaveLength(5);
  });

  it('looks for configs in the root and top-level folders', () => {
    const paths = configCandidatePaths(['server/src/x.ts', 'client/src/y.tsx', 'server/z.ts']);
    expect(paths).toContain('tsconfig.json');
    expect(paths).toContain('server/.prettierrc');
    expect(paths).toContain('client/eslint.config.js');
    expect(paths.filter((p) => p === 'server/package.json')).toHaveLength(1);
  });

  it('numbers lines from 1 and truncates long files', () => {
    expect(numberLines('a\nb')).toBe('   1| a\n   2| b');
    const long = Array.from({ length: 300 }, (_, i) => `l${i}`).join('\n');
    expect(numberLines(long)).toContain('50 more lines not shown');
  });

  it('normalizes paths', () => {
    expect(normalizePath('./server/a.ts')).toBe('server/a.ts');
    expect(normalizePath('/server\\a.ts')).toBe('server/a.ts');
  });
});

describe('verifyEvidence', () => {
  it('keeps a citation whose snippet sits at the cited lines, storing the real text', () => {
    const [e] = verifyEvidence(
      [{ path: 'server/src/a.ts', line_start: 5, line_end: 5, snippet: "if (!row) throw new NotFoundError('missing');" }],
      files,
    );
    expect(e).toEqual({
      path: 'server/src/a.ts',
      line_start: 5,
      line_end: 5,
      snippet: "  if (!row) throw new NotFoundError('missing');",
    });
  });

  it('relocates a snippet cited at the wrong lines', () => {
    const [e] = verifyEvidence(
      [{ path: 'server/src/a.ts', line_start: 1, line_end: 2, snippet: '  const row = await repo.find(id);\n  if (!row) throw' }],
      files,
    );
    expect(e?.line_start).toBe(4);
    expect(e?.line_end).toBe(5);
  });

  it('accepts a snippet that echoes the line-number gutter', () => {
    const out = verifyEvidence(
      [{ path: 'server/src/a.ts', line_start: 4, line_end: 4, snippet: '   4|   const row = await repo.find(id);' }],
      files,
    );
    expect(out).toHaveLength(1);
  });

  it('drops invented code, unknown files and trivial snippets', () => {
    expect(
      verifyEvidence(
        [
          { path: 'server/src/a.ts', line_start: 4, line_end: 4, snippet: 'const user = await db.users.find(id);' },
          { path: 'server/src/other.ts', line_start: 1, line_end: 1, snippet: FILE.split('\n')[0]! },
          { path: 'server/src/a.ts', line_start: 7, line_end: 7, snippet: '}' },
        ],
        files,
      ),
    ).toEqual([]);
  });
});

describe('adherence', () => {
  it('rejects unsafe or useless patterns', () => {
    expect(isSafePattern('throw new NotFoundError\\(')).toBe(true);
    expect(isSafePattern('--pre=sh')).toBe(false);
    expect(isSafePattern('.*')).toBe(false);
    expect(isSafePattern('(a+)+$')).toBe(false);
    // repeated groups backtrack exponentially even without a nested quantifier
    expect(isSafePattern('^(a|aa)+$')).toBe(false);
    expect(isSafePattern('(?:\\w|\\d)*x')).toBe(false);
    expect(isSafePattern('(ab){2,}')).toBe(false);
    // an escaped paren or an optional group is fine
    expect(isSafePattern('useQuery\\(\\)+')).toBe(true);
    expect(isSafePattern('export (async )?function')).toBe(true);
    expect(isSafePattern('(?=x)y')).toBe(false);
    expect(isSafePattern('(a)\\1')).toBe(false);
    expect(isSafePattern('[')).toBe(false);
    expect(isSafePattern('x'.repeat(201))).toBe(false);
    expect(isSafePattern(null)).toBe(false);
  });

  const grepWith =
    (table: Record<string, string[]>) =>
    async (pattern: string): Promise<CodeMatch[]> =>
      (table[pattern] ?? []).map((path) => ({ path, line: 1, text: '' }));

  it('counts conforming vs violating source files within the prefix', async () => {
    const grep = grepWith({
      good: ['server/a.ts', 'server/b.ts', 'server/c.ts', 'server/d.ts', 'client/x.ts', 'server/README.md'],
      bad: ['server/d.ts', 'server/e.ts'],
    });
    const m = await measureAdherence({ pattern: 'good', counter_pattern: 'bad', path_prefix: 'server/' }, grep);
    expect(m).toEqual({ adherence: 3 / 5, support: 3, violations: 2 });
  });

  it('returns null without a usable detector or when the pattern matches nothing', async () => {
    const grep = grepWith({ good: ['a.ts'] });
    expect(await measureAdherence(null, grep)).toBeNull();
    expect(await measureAdherence({ pattern: 'none', counter_pattern: null, path_prefix: null }, grep)).toBeNull();
    const failing = async () => {
      throw new Error('rg failed');
    };
    expect(await measureAdherence({ pattern: 'good', counter_pattern: null, path_prefix: null }, failing)).toBeNull();
    expect(await measureAdherence({ pattern: 'good', counter_pattern: null, path_prefix: null }, grep)).toEqual({
      adherence: null,
      support: 1,
      violations: null,
    });
  });

  it('scores confidence from measurements, not the model', () => {
    const measured = { adherence: 0.9, support: 9, violations: 1 };
    expect(scoreConfidence({ modelConfidence: 0.1, measured, evidenceFiles: 2 })).toBe(0.9);
    // single-file evidence is capped
    expect(scoreConfidence({ modelConfidence: 1, measured, evidenceFiles: 1 })).toBe(0.69);
    // few matching files are discounted
    expect(scoreConfidence({ modelConfidence: 1, measured: { adherence: 1, support: 2, violations: 0 }, evidenceFiles: 2 })).toBe(0.4);
    // pattern only, no counter-pattern
    expect(scoreConfidence({ modelConfidence: 1, measured: { adherence: null, support: 10, violations: null }, evidenceFiles: 3 })).toBe(0.6);
    // nothing measured: the model's number, capped low
    expect(scoreConfidence({ modelConfidence: 0.95, measured: null, evidenceFiles: 3 })).toBe(0.5);
  });

  it('flags low adherence only with enough matching files', () => {
    expect(isLowAdherence({ adherence: 0.4, support: 2, violations: 3 })).toBe(true);
    expect(isLowAdherence({ adherence: 0.5, support: 1, violations: 1 })).toBe(false);
    expect(isLowAdherence({ adherence: null, support: 9, violations: null })).toBe(false);
    expect(isLowAdherence(null)).toBe(false);
  });
});

describe('tooling', () => {
  it('parses JSON with comments and trailing commas, keeping // inside strings', () => {
    expect(
      parseJsonc('{\n // c\n "$schema": "https://x.dev/s.json", /* b */ "a": [1,],\n}'),
    ).toEqual({ $schema: 'https://x.dev/s.json', a: [1] });
    expect(parseJsonc('not json')).toBeNull();
  });

  it('derives facts from prettier, tsconfig, eslint (json + flat), editorconfig, biome', () => {
    const facts = toolingFacts([
      { path: '.prettierrc', kind: 'config', content: '{ "singleQuote": true }' },
      { path: 'server/tsconfig.json', kind: 'config', content: '{ "compilerOptions": { "strict": true, "noUncheckedIndexedAccess": true, "noEmit": true } }' },
      { path: '.eslintrc.json', kind: 'config', content: '{ "rules": { "no-console": "error", "eqeqeq": ["error"], "semi": "off", "import/order": "warn" } }' },
      { path: 'client/eslint.config.js', kind: 'config', content: "export default [{ rules: { '@typescript-eslint/no-explicit-any': 'error', 'prefer-const': 2 } }]" },
      { path: '.editorconfig', kind: 'config', content: 'root = true\n[*]\nindent_style = space\nmax_line_length = 100' },
      { path: 'biome.json', kind: 'config', content: '{ "formatter": { "enabled": false }, "linter": { "rules": { "suspicious": { "noExplicitAny": "error" } } } }' },
    ]);
    const topics = facts.map((f) => `${f.tool}:${f.topic}`);
    expect(topics).toContain('prettier:quotes');
    expect(topics).toContain('typescript:strict type checking');
    expect(topics).toContain('typescript:unchecked indexed access');
    expect(topics).toContain('eslint:no-console');
    expect(topics).toContain('eslint:eqeqeq');
    expect(topics).not.toContain('eslint:semi');
    expect(topics).toContain('eslint:@typescript-eslint/no-explicit-any');
    expect(topics).toContain('eslint:prefer-const');
    expect(topics).toContain('editorconfig:line length');
    expect(topics).toContain('biome:noExplicitAny');
    expect(topics).not.toContain('biome:quotes');
    expect(toolingLabels(facts)).toContain('prettier (.prettierrc)');
  });

  it('matches rules that restate a tool, and only those', () => {
    const facts = toolingFacts([
      { path: '.prettierrc', kind: 'config', content: '{}' },
      { path: '.eslintrc.json', kind: 'config', content: '{ "rules": { "no-console": "error", "import/order": "error" } }' },
    ]);
    expect(matchTooling('Use single quotes for strings', facts)).toBe('prettier (.prettierrc): quotes');
    expect(matchTooling('Never call console.log; use the logger', facts)).toBe('eslint (.eslintrc.json): no-console');
    expect(matchTooling('Keep imports sorted: builtins first', facts)).toContain('import/order');
    // a one-word rule name ("order") must not swallow unrelated rules
    expect(matchTooling('Register plugins in dependency order', facts)).toBeNull();
  });
});

describe('refineCandidates', () => {
  const candidate = (over: Partial<ExtractedConvention>): ExtractedConvention => ({
    category: 'error-handling',
    rule: 'Throw NotFoundError for missing rows',
    evidence: [{ path: 'server/src/a.ts', line_start: 5, line_end: 5, snippet: "throw new NotFoundError('missing')" }],
    detector: null,
    confidence: 0.8,
    ...over,
  });

  it('normalizes rules for comparison', () => {
    expect(normalizeRule('  Use `AppError`,  not Error! ')).toBe('use apperror not error');
  });

  it('gates on evidence, decisions, duplicates and adherence; flags tooling', async () => {
    const grep = async (pattern: string): Promise<CodeMatch[]> =>
      pattern === 'good'
        ? ['a.ts', 'b.ts'].map((path) => ({ path, line: 1, text: '' }))
        : ['c.ts', 'd.ts', 'e.ts'].map((path) => ({ path, line: 1, text: '' }));
    const facts = toolingFacts([{ path: '.prettierrc', kind: 'config', content: '{}' }]);
    const { kept, dropped } = await refineCandidates({
      proposed: [
        candidate({}),
        candidate({ rule: 'throw NotFoundError for missing rows.' }), // duplicate
        candidate({ rule: 'Rejected before', category: 'naming' }),
        candidate({ rule: 'Invented', evidence: [{ path: 'x.ts', line_start: 1, line_end: 1, snippet: 'const x = invented();' }] }),
        candidate({ rule: 'Mostly broken', detector: { pattern: 'good', counter_pattern: 'bad', path_prefix: null } }),
        candidate({ rule: 'Use single quotes in imports' }),
        candidate({ rule: '   ' }),
      ],
      files,
      facts,
      known: [{ rule: 'Rejected before', status: 'rejected' }],
      grep,
    });
    expect(kept.map((k) => k.rule)).toEqual([
      'Throw NotFoundError for missing rows',
      'Use single quotes in imports',
    ]);
    expect(kept[0]).toMatchObject({ confidence: 0.5, adherence: null, supportFiles: null, enforcedBy: null });
    expect(kept[1]?.enforcedBy).toBe('prettier (.prettierrc): quotes');
    expect(dropped).toEqual({
      duplicate: 1,
      already_decided: 1,
      unverified_evidence: 1,
      low_adherence: 1,
      empty_rule: 1,
    });
  });
});
