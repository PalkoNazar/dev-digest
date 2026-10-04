import { describe, it, expect } from 'vitest';
import { extractRefs } from '../src/modules/reviews/intent/refs.js';

const refs = (body: string) =>
  extractRefs({ title: 't', body, branch: 'feat/x', repo: { owner: 'o', name: 'r' }, prNumber: 1 });

describe('extractRefs docs', () => {
  it('reads root and plan-folder docs', () => {
    const r = refs('See `specs/2026-10-04-smart-diff.md`, `specs/plans/a.plan.md` and `README.md`.');
    expect(r.docs.map((d) => d.path)).toEqual(['specs/2026-10-04-smart-diff.md', 'specs/plans/a.plan.md', 'README.md']);
    expect(r.unresolved).toEqual([]);
  });

  it('ignores safe file mentions outside plan folders instead of flagging missing context', () => {
    const r = refs('`.claude/skills/security/SKILL.md` → wiring; `e2e/README.md`; `client/INSIGHTS.md`.');
    expect(r.docs).toEqual([]);
    expect(r.unresolved).toEqual([]);
  });

  it.each(['../x.md', '.env.md', '.git/notes.md'])('still reports an unsafe path %s as invalid_path', (p) => {
    const r = refs(`see ${p}`);
    expect(r.docs).toEqual([]);
    expect(r.unresolved).toContainEqual(expect.objectContaining({ kind: 'doc', reason: 'invalid_path' }));
  });
});
