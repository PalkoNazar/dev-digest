import type { ChatMessage } from '@devdigest/shared';
import { INJECTION_GUARD, wrapUntrusted } from '@devdigest/reviewer-core';
import { MAX_INPUT_TOKENS } from '../constants.js';
import type { TourFacts } from '../types.js';
import { capReadme, codePointCut } from './facts.js';

/**
 * The messages of the one LLM call (plan S9, A7). Every repo-authored fact goes
 * inside a `wrapUntrusted` block with a fixed label; the system message ends with
 * the shared `INJECTION_GUARD` (AC-59). The total stays within `MAX_INPUT_TOKENS`
 * by cutting facts in a fixed order (AC-33, Q3); the reading path and the critical
 * paths are never cut.
 */

/** How much of each fact was cut to fit the budget (counts are items dropped). */
export interface TourPromptCut {
  signatures: number;
  repoMapLines: number;
  routes: number;
  nestedScriptDirs: number;
  readme: 'kept' | 'halved' | 'dropped';
  rootScripts: number;
  folders: number;
}

export interface TourMessages {
  messages: ChatMessage[];
  /** count(system) + count(user). */
  inputTokens: number;
  cut: TourPromptCut;
}

interface Keep {
  signatures: number;
  repoMapLines: number;
  routes: number;
  nestedDirs: number;
  readme: TourPromptCut['readme'];
  rootScripts: number;
  folders: number;
}

const NONE = '(none)';

function listOr(lines: readonly string[]): string {
  return lines.length ? lines.join('\n') : NONE;
}

function depth(dir: string): number {
  return dir.split('/').length;
}

/** Sections in a fixed order: our heading, then the fact in an untrusted block. */
function renderUser(repoName: string, facts: TourFacts, k: Keep, ctx: Prepared): string {
  const idx = facts.index;
  const indexStatus = [
    `status: ${idx.status}`,
    `files indexed: ${idx.files_indexed} of ${idx.files_total}`,
    `reason: ${idx.reason ?? NONE}`,
    `languages indexed: ${facts.languagesIndexed ? 'yes' : 'no'}`,
  ].join('\n');

  const scriptLines: string[] = [];
  const root = ctx.rootScripts.slice(0, k.rootScripts);
  if (ctx.hasRootScripts) {
    scriptLines.push('. (root):', ...(root.length ? root.map(([n, c]) => `  ${n}: ${c}`) : ['  ' + NONE]));
  }
  for (const dir of ctx.nestedDirs.slice(0, k.nestedDirs)) {
    scriptLines.push(`${dir}:`, ...Object.entries(facts.scriptsByDir[dir] ?? {}).map(([n, c]) => `  ${n}: ${c}`));
  }

  const runFacts = [
    `package manager: ${facts.packageManager ?? NONE}`,
    `compose file: ${facts.composeFile ?? NONE}`,
    `compose services: ${facts.composeServices.length ? facts.composeServices.join(', ') : NONE}`,
    `.env.example present: ${facts.hasEnvExample ? 'yes' : 'no'}`,
  ].join('\n');

  const readme = k.readme === 'dropped' ? '' : k.readme === 'halved' ? ctx.readmeHalf : ctx.readme;

  const sections: [string, string, string][] = [
    ['Index status', 'index-status', indexStatus],
    ['Stack', 'stack', listOr(facts.stack)],
    [
      'Structure (top-level folders with indexed-file counts)',
      'structure',
      listOr(facts.folders.slice(0, k.folders).map((f) => `${f.path}: ${f.files}`)),
    ],
    ['README (excerpt)', 'readme', readme || NONE],
    [
      'Reading path (order fixed by DevDigest; give a reason for each path)',
      'reading-path',
      listOr(facts.readingPath.map((p, i) => `${i + 1}. ${p}`)),
    ],
    [
      'Critical paths (root first; describe each root)',
      'critical-paths',
      listOr(facts.criticalPaths.map((c) => c.join(' -> '))),
    ],
    ['package.json scripts by directory', 'scripts', listOr(scriptLines)],
    ['Run facts', 'run-facts', runFacts],
    ['Routes (highest-ranked first)', 'routes', listOr(facts.routes.slice(0, k.routes))],
    ['Repo map', 'repo-map', ctx.repoMapLines.slice(0, k.repoMapLines).join('\n') || NONE],
    [
      'Symbol signatures of top-ranked files',
      'signatures',
      listOr(facts.signatures.slice(0, k.signatures).map((s) => `${s.file}: ${s.signature}`)),
    ],
  ];
  return [
    `Write the onboarding tour for the repository ${repoName}. The facts below were collected by DevDigest.`,
    ...sections.map(([title, label, body]) => `## ${title}\n${wrapUntrusted(label, body)}`),
  ].join('\n\n');
}

interface Prepared {
  readme: string;
  readmeHalf: string;
  repoMapLines: string[];
  hasRootScripts: boolean;
  rootScripts: [string, string][];
  /** Nested `package.json` dirs, shallowest first (the deepest are cut first). */
  nestedDirs: string[];
}

/** The largest `k` in [0, n] for which `fits(k)` holds (fits is monotone); 0 if none. */
function largestFitting(n: number, fits: (k: number) => boolean): number {
  if (fits(n)) return n;
  let lo = 0;
  let hi = n - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (fits(mid)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

export function buildTourMessages(input: {
  system: string;
  repoName: string;
  facts: TourFacts;
  count: (text: string) => number;
}): TourMessages {
  const { repoName, facts, count } = input;
  const system = `${input.system}\n\n${INJECTION_GUARD}`;
  const systemTokens = count(system);

  const readme = facts.readme ? capReadme(facts.readme) : '';
  const nestedDirs = Object.keys(facts.scriptsByDir)
    .filter((d) => d !== '.')
    .sort((a, b) => depth(a) - depth(b) || (a < b ? -1 : a > b ? 1 : 0));
  const ctx: Prepared = {
    readme,
    readmeHalf: readme.slice(0, codePointCut(readme, Math.floor(readme.length / 2))),
    repoMapLines: facts.repoMap ? facts.repoMap.split('\n') : [],
    hasRootScripts: Object.hasOwn(facts.scriptsByDir, '.'),
    rootScripts: Object.entries(facts.scriptsByDir['.'] ?? {}),
    nestedDirs,
  };

  const keep: Keep = {
    signatures: facts.signatures.length,
    repoMapLines: ctx.repoMapLines.length,
    routes: facts.routes.length,
    nestedDirs: nestedDirs.length,
    readme: 'kept',
    rootScripts: ctx.rootScripts.length,
    folders: facts.folders.length,
  };
  const total = (k: Keep) => systemTokens + count(renderUser(repoName, facts, k, ctx));
  const fits = (k: Keep) => total(k) <= MAX_INPUT_TOKENS;

  // Cut order (AC-33, Q3, A7): each stage keeps the longest prefix that fits, and
  // drops everything when nothing fits, before the next stage starts.
  const stages: Array<keyof Pick<Keep, 'signatures' | 'repoMapLines' | 'routes' | 'nestedDirs'>> = [
    'signatures',
    'repoMapLines',
    'routes',
    'nestedDirs',
  ];
  for (const key of stages) {
    if (fits(keep)) break;
    keep[key] = largestFitting(keep[key], (n) => fits({ ...keep, [key]: n }));
  }
  if (!fits(keep) && readme) {
    keep.readme = 'halved';
    if (!fits(keep)) keep.readme = 'dropped';
  }
  for (const key of ['rootScripts', 'folders'] as const) {
    if (fits(keep)) break;
    keep[key] = largestFitting(keep[key], (n) => fits({ ...keep, [key]: n }));
  }

  const user = renderUser(repoName, facts, keep, ctx);
  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    inputTokens: systemTokens + count(user),
    cut: {
      signatures: facts.signatures.length - keep.signatures,
      repoMapLines: ctx.repoMapLines.length - keep.repoMapLines,
      routes: facts.routes.length - keep.routes,
      nestedScriptDirs: nestedDirs.length - keep.nestedDirs,
      readme: keep.readme,
      rootScripts: ctx.rootScripts.length - keep.rootScripts,
      folders: facts.folders.length - keep.folders,
    },
  };
}
