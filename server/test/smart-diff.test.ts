import { describe, it, expect } from 'vitest';
import { SmartDiff, SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from '../src/modules/reviews/smart-diff/classify.js';
import {
  buildSmartDiff,
  latestReviewsPerAgent,
} from '../src/modules/reviews/smart-diff/build.js';
import { ROLE_ORDER } from '../src/modules/reviews/smart-diff/constants.js';

/**
 * Smart Diff — pure classifier (path → role). First matching rule wins in the
 * order boilerplate → tests → wiring → docs; everything else is core.
 */

describe('classifyFile', () => {
  it.each([
    // disputed cases (spec)
    ['__tests__/__snapshots__/x.snap', 'boilerplate'],
    ['.claude/skills/security/SKILL.md', 'wiring'],
    ['e2e/README.md', 'tests'],
    // boilerplate
    ['pnpm-lock.yaml', 'boilerplate'],
    ['client/package-lock.json', 'boilerplate'],
    ['Cargo.lock', 'boilerplate'],
    ['dist/app.js', 'boilerplate'],
    ['vendor/jquery.min.js', 'boilerplate'],
    ['src/api.generated.ts', 'boilerplate'],
    // tests
    ['server/test/helpers/pg.ts', 'tests'],
    ['server/test/reviews.it.test.ts', 'tests'],
    ['client/src/x/Y.test.tsx', 'tests'],
    ['a/b.spec.ts', 'tests'],
    // wiring
    ['client/src/components/diff-viewer/index.ts', 'wiring'],
    ['server/vitest.config.ts', 'wiring'],
    ['client/tsconfig.json', 'wiring'],
    ['.env.example', 'wiring'],
    ['docker-compose.yml', 'wiring'],
    ['.github/workflows/ci.yml', 'wiring'],
    // docs
    ['README.md', 'docs'],
    ['docs/agent-prompts/README.md', 'docs'],
    ['server/src/modules/reviews/AGENTS.md', 'docs'],
    ['CHANGELOG.md', 'docs'],
    ['LICENSE', 'docs'],
    // core (fallback)
    ['server/src/modules/reviews/service.ts', 'core'],
    ['client/messages/en/prReview.json', 'core'],
    ['src/config.ts', 'core'],
  ] as const)('%s → %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it('ROLE_ORDER lists the 5 contract roles in display order', () => {
    expect(ROLE_ORDER).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    for (const role of ROLE_ORDER) expect(SmartDiffRole.options).toContain(role);
  });
});

type R = { id: string; kind: 'summary' | 'review'; agentId: string | null; createdAt: Date };
const at = (iso: string) => new Date(iso);

describe('latestReviewsPerAgent', () => {
  it('keeps the newest review per agent, newest first, ignoring summaries', () => {
    const reviews: R[] = [
      { id: 'a-old', kind: 'review', agentId: 'A', createdAt: at('2026-10-01T10:00:00Z') },
      { id: 'b', kind: 'review', agentId: 'B', createdAt: at('2026-10-01T11:00:00Z') },
      { id: 'sum', kind: 'summary', agentId: 'A', createdAt: at('2026-10-03T10:00:00Z') },
      { id: 'a-new', kind: 'review', agentId: 'A', createdAt: at('2026-10-02T10:00:00Z') },
    ];
    expect(latestReviewsPerAgent(reviews).map((r) => r.id)).toEqual(['a-new', 'b']);
  });

  it('treats a null agent as its own bucket and is order-independent', () => {
    const reviews: R[] = [
      { id: 'n-old', kind: 'review', agentId: null, createdAt: at('2026-10-01T10:00:00Z') },
      { id: 'a', kind: 'review', agentId: 'A', createdAt: at('2026-10-01T09:00:00Z') },
      { id: 'n-new', kind: 'review', agentId: null, createdAt: at('2026-10-02T10:00:00Z') },
    ];
    expect(latestReviewsPerAgent(reviews).map((r) => r.id)).toEqual(['n-new', 'a']);
    expect(latestReviewsPerAgent([...reviews].reverse()).map((r) => r.id)).toEqual(['n-new', 'a']);
  });

  it('returns [] for no reviews', () => {
    expect(latestReviewsPerAgent([])).toEqual([]);
  });
});

describe('buildSmartDiff', () => {
  const files = [
    { path: 'README.md', additions: 2, deletions: 1 },
    { path: 'src/b.ts', additions: 10, deletions: 0 },
    { path: 'pnpm-lock.yaml', additions: 100, deletions: 50 },
    { path: 'src/a.ts', additions: 5, deletions: 3 },
    { path: 'src/a.test.ts', additions: 7, deletions: 0 },
  ];

  it('groups files in ROLE_ORDER, omits empty groups, keeps input order', () => {
    const d = buildSmartDiff(files, []);
    expect(d.groups.map((g) => g.role)).toEqual(['core', 'tests', 'docs', 'boilerplate']);
    expect(d.groups[0]!.files.map((f) => f.path)).toEqual(['src/b.ts', 'src/a.ts']);
    expect(d.groups.every((g) => g.files.every((f) => f.finding_lines.length === 0))).toBe(true);
  });

  it('finding_lines are sorted unique start lines of that file; unknown paths ignored', () => {
    const d = buildSmartDiff(files, [
      { file: 'src/a.ts', start_line: 52 },
      { file: 'src/a.ts', start_line: 28 },
      { file: 'src/a.ts', start_line: 52 },
      { file: 'not/in/pr.ts', start_line: 3 },
    ]);
    const a = d.groups[0]!.files.find((f) => f.path === 'src/a.ts')!;
    expect(a.finding_lines).toEqual([28, 52]);
    expect(a.pseudocode_summary).toBeUndefined();
    expect(d.groups.flatMap((g) => g.files).some((f) => f.path === 'not/in/pr.ts')).toBe(false);
  });

  it('split_suggestion is minimal with total_lines = Σ additions + deletions', () => {
    const d = buildSmartDiff(files, []);
    expect(d.split_suggestion).toEqual({ too_big: false, total_lines: 178, proposed_splits: [] });
  });

  it('no files → no groups, 0 lines', () => {
    const d = buildSmartDiff([], []);
    expect(d.groups).toEqual([]);
    expect(d.split_suggestion.total_lines).toBe(0);
  });

  it('result passes the SmartDiff contract', () => {
    const d = buildSmartDiff(files, [{ file: 'src/a.ts', start_line: 1 }]);
    expect(() => SmartDiff.parse(d)).not.toThrow();
  });
});
