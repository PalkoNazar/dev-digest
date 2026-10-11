import type { OnboardingCriticalPath, OnboardingTour } from '@devdigest/shared';
import { CRITICAL_PATHS_MAX } from '../constants.js';
import type { TourDraft, TourFacts } from '../types.js';
import { deterministicRunSteps } from './facts.js';
import { groundMarkdown, validateRunStep } from './grounding.js';

/**
 * Tour assembly (plan S8): critical-path entries, the deterministic skeleton and
 * the merge of the LLM draft onto computed facts. Pure. AC-28…AC-30, AC-36,
 * AC-45, AC-57, AC-58, AC-70, AC-76, AC-80, AC-82, AC-90.
 */

export type TourSections = OnboardingTour['sections'];

/**
 * The first `CRITICAL_PATHS_MAX` facade chains whose root is a file at the commit;
 * `chain` keeps only the grounded rest (AC-29, AC-57). `importers` is null when the
 * index can't count them (AC-70). No chains → `[]` (AC-30).
 */
export function criticalEntries(
  chains: readonly (readonly string[])[],
  importerCounts: Readonly<Record<string, number>> | null,
  fileSet: ReadonlySet<string>,
): OnboardingCriticalPath[] {
  const out: OnboardingCriticalPath[] = [];
  const roots = new Set<string>();
  for (const chain of chains) {
    if (out.length >= CRITICAL_PATHS_MAX) break;
    const [root, ...rest] = chain;
    if (!root || !fileSet.has(root) || roots.has(root)) continue;
    roots.add(root);
    out.push({
      root,
      chain: rest.filter((p) => fileSet.has(p)),
      importers: importerCounts?.[root] ?? null,
      description: null,
    });
  }
  return out;
}

function fileCount(n: number): string {
  return `${n} indexed ${n === 1 ? 'file' : 'files'}`;
}

/** Stack and top-level folders as Markdown — the skeleton architecture body. */
function architectureBody(facts: TourFacts): string {
  const parts: string[] = [];
  if (facts.stack.length) parts.push(`**Stack:** ${facts.stack.join(', ')}`);
  if (facts.folders.length) {
    parts.push(
      ['**Top-level folders**', ...facts.folders.map((f) => `- \`${f.path}\` — ${fileCount(f.files)}`)].join(
        '\n',
      ),
    );
  }
  return parts.length ? parts.join('\n\n') : 'No stack or folder facts were found in this repository.';
}

/** The deterministic tour, with no LLM text (AC-45). */
export function buildSkeleton(facts: TourFacts, entries: OnboardingCriticalPath[]): TourSections {
  return {
    architecture: {
      body_md: architectureBody(facts),
      diagram: null,
      stack: [...facts.stack],
      folders: facts.folders.map((f) => ({ ...f })),
    },
    critical_paths: { body_md: null, entries: entries.map((e) => ({ ...e, description: null })) },
    run_locally: { body_md: null, steps: deterministicRunSteps(facts), source: 'deterministic' },
    reading_path: { body_md: null, items: facts.readingPath.map((path) => ({ path, reason: null })) },
    first_tasks: { body_md: null },
  };
}

/**
 * Merges the LLM draft onto the computed facts (AC-36). The reading path and its
 * order, the critical-path entries and the folder data always come from the facts;
 * the LLM only adds text keyed by them. Everything ungrounded is dropped and
 * counted in `removed` (AC-57, AC-58); an empty section takes its skeleton part
 * (AC-80).
 */
export function mergeDraft(
  draft: TourDraft,
  facts: TourFacts,
  entries: OnboardingCriticalPath[],
): { sections: TourSections; removed: number } {
  const skeleton = buildSkeleton(facts, entries);
  let removed = 0;
  const ground = (md: string | null): string | null => {
    if (md === null) return null;
    const g = groundMarkdown(md, facts.fileSet);
    removed += g.removed;
    return g.md.trim() === '' ? null : g.md;
  };

  // Reasons attach by path; the order is the computed one (AC-28).
  const reasons = new Map<string, string>();
  for (const r of draft.reading_path.reasons) {
    if (!facts.fileSet.has(r.path)) {
      removed++;
      continue;
    }
    const reason = ground(r.reason);
    if (reason !== null && !reasons.has(r.path)) reasons.set(r.path, reason);
  }

  // Descriptions attach by root (AC-76).
  const descriptions = new Map<string, string>();
  for (const d of draft.critical_paths.descriptions) {
    if (!facts.fileSet.has(d.root)) {
      removed++;
      continue;
    }
    const description = ground(d.description);
    if (description !== null && !descriptions.has(d.root)) descriptions.set(d.root, description);
  }

  // Run steps: only valid ones; none left → the deterministic steps (AC-82).
  const ctx = { pm: facts.packageManager, scriptsByDir: facts.scriptsByDir, fileSet: facts.fileSet };
  const steps = draft.run_locally.steps
    .map((s) => ({ command: s.command.trim() }))
    .filter((s) => validateRunStep(s.command, ctx));

  const diagram = draft.architecture.diagram?.trim() ? draft.architecture.diagram : null;

  const sections: TourSections = {
    architecture: {
      body_md: ground(draft.architecture.body_md) ?? skeleton.architecture.body_md,
      diagram,
      stack: skeleton.architecture.stack,
      folders: skeleton.architecture.folders,
    },
    critical_paths: {
      body_md: ground(draft.critical_paths.body_md),
      entries: entries.map((e) => ({ ...e, description: descriptions.get(e.root) ?? null })),
    },
    run_locally: {
      body_md: ground(draft.run_locally.body_md),
      ...(steps.length
        ? { steps, source: 'llm' as const }
        : { steps: skeleton.run_locally.steps, source: 'deterministic' as const }),
    },
    reading_path: {
      body_md: ground(draft.reading_path.body_md),
      items: facts.readingPath.map((path) => ({ path, reason: reasons.get(path) ?? null })),
    },
    first_tasks: { body_md: ground(draft.first_tasks.body_md) ?? skeleton.first_tasks.body_md },
  };
  return { sections, removed };
}
