import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { applyScopeFilter } from '../src/index.js';
import { scoreFromFindings } from '../src/review/reduce.js';

let n = 0;
function f(over: Partial<Finding>): Finding {
  n += 1;
  return {
    id: `f${n}`,
    severity: 'WARNING',
    category: 'bug',
    title: `finding ${n}`,
    file: 'src/a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'r',
    confidence: 0.8,
    kind: 'finding',
    ...over,
  };
}

describe('applyScopeFilter', () => {
  it('tag mode never drops anything', () => {
    const findings = [f({ scope: 'out', severity: 'SUGGESTION' }), f({ scope: 'out' }), f({ scope: 'in' })];
    const r = applyScopeFilter(findings, 'tag');
    expect(r.kept).toEqual(findings);
    expect(r.filtered).toEqual([]);
    expect(r.signal).toBeNull();
  });

  it('enforce with no out-of-scope findings changes nothing', () => {
    const findings = [f({ scope: 'in' }), f({ scope: null }), f({})];
    const r = applyScopeFilter(findings, 'enforce');
    expect(r.kept).toEqual(findings);
    expect(r.filtered).toEqual([]);
  });

  it('enforce drops out-of-scope SUGGESTIONs and keeps no signal below WARNING', () => {
    const a = f({ scope: 'out', severity: 'SUGGESTION' });
    const b = f({ scope: 'out', severity: 'SUGGESTION' });
    const inScope = f({ scope: 'in' });
    const r = applyScopeFilter([a, inScope, b], 'enforce');
    expect(r.kept).toEqual([inScope]);
    expect(r.filtered).toEqual([a, b]);
    expect(r.signal).toBeNull();
  });

  it('never drops a CRITICAL, whatever its category (author-shaped intent must not hide it)', () => {
    const critBug = f({ scope: 'out', severity: 'CRITICAL', category: 'bug' });
    const critPerf = f({ scope: 'out', severity: 'CRITICAL', category: 'perf' });
    const r = applyScopeFilter([critBug, critPerf], 'enforce');
    expect(r.kept).toEqual([critBug, critPerf]);
    expect(r.filtered).toEqual([]);
    expect(r.signal).toBeNull();
  });

  it('keeps the single most severe droppable WARNING as the signal', () => {
    const warn = f({ scope: 'out', severity: 'WARNING', confidence: 0.99 });
    const warn2 = f({ scope: 'out', severity: 'WARNING', confidence: 0.5 });
    const sugg = f({ scope: 'out', severity: 'SUGGESTION' });
    const r = applyScopeFilter([warn2, warn, sugg], 'enforce');
    expect(r.signal).toBe(warn);
    expect(r.kept).toEqual([warn]);
    expect(r.filtered).toEqual([warn2, sugg]);
  });

  it('an exempt finding never takes the signal slot', () => {
    const secCrit = f({ scope: 'out', severity: 'CRITICAL', category: 'security', confidence: 0.99 });
    const bugWarn = f({ scope: 'out', severity: 'WARNING', category: 'bug', confidence: 0.6 });
    const r = applyScopeFilter([secCrit, bugWarn], 'enforce');
    expect(r.signal).toBe(bugWarn);
    expect(r.kept).toEqual([secCrit, bugWarn]);
    expect(r.filtered).toEqual([]);
  });

  it('breaks severity ties by higher confidence, then by first seen', () => {
    const low = f({ scope: 'out', severity: 'WARNING', category: 'bug', confidence: 0.6 });
    const high = f({ scope: 'out', severity: 'WARNING', category: 'bug', confidence: 0.9 });
    expect(applyScopeFilter([low, high], 'enforce').signal).toBe(high);

    const first = f({ scope: 'out', severity: 'WARNING', confidence: 0.7 });
    const second = f({ scope: 'out', severity: 'WARNING', confidence: 0.7 });
    const r = applyScopeFilter([first, second], 'enforce');
    expect(r.signal).toBe(first);
    expect(r.filtered).toEqual([second]);
  });

  it('never drops security exemptions: secret_leak, lethal_trifecta, security at WARNING+', () => {
    const signal = f({ scope: 'out', severity: 'WARNING', category: 'bug', confidence: 0.99 });
    const leak = f({ scope: 'out', severity: 'SUGGESTION', kind: 'secret_leak' });
    const trifecta = f({ scope: 'out', severity: 'SUGGESTION', kind: 'lethal_trifecta' });
    const secWarn = f({ scope: 'out', severity: 'WARNING', category: 'security' });
    const secSugg = f({ scope: 'out', severity: 'SUGGESTION', category: 'security' });
    const r = applyScopeFilter([signal, leak, trifecta, secWarn, secSugg], 'enforce');
    expect(r.signal).toBe(signal);
    expect(r.kept).toEqual([signal, leak, trifecta, secWarn]);
    expect(r.filtered).toEqual([secSugg]);
  });

  it('keeps the original order of kept findings', () => {
    const a = f({ scope: 'in' });
    const out = f({ scope: 'out', severity: 'CRITICAL' });
    const b = f({ scope: null });
    expect(applyScopeFilter([a, out, b], 'enforce').kept).toEqual([a, out, b]);
  });

  it('the score over the kept set differs from the unfiltered one', () => {
    const inScope = f({ scope: 'in', severity: 'SUGGESTION' });
    const dropped = f({ scope: 'out', severity: 'SUGGESTION' });
    const all = [inScope, dropped];
    const { kept } = applyScopeFilter(all, 'enforce');
    expect(kept).toEqual([inScope]);
    expect(scoreFromFindings(kept)).toBeGreaterThan(scoreFromFindings(all));
  });
});
