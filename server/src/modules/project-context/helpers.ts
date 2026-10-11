import type { ContextDocRow, GitTreeEntry } from '@devdigest/shared';
import {
  BLOB_MODES,
  EXCLUDED_DIRS,
  MAX_DOC_CHARS,
  MAX_TOTAL_CHARS,
  SYMLINK_MODE,
  truncationMarker,
} from './constants.js';

/**
 * L05 Project Context — pure core (plan S5): discovery over a git tree listing,
 * the effective document list, the 20k/60k limits, Context-tab rows, used-by.
 */

/** A listed document. `source` is the blob to read: the path itself, or a link's in-tree target. */
export interface DiscoveredDoc {
  path: string;
  source: string;
  size: number | null;
}

/** Reads a symlink's text (`git show HEAD:<link>`); null when unreadable. */
export type ReadLink = (linkPath: string) => string | null | Promise<string | null>;

export interface EffectiveDoc {
  path: string;
  /** Attached to the agent directly. */
  own: boolean;
  /** Names of the effective skills that carry the path, in skill order. */
  via: string[];
}

export interface FittedDoc {
  path: string;
  text: string;
  truncated: boolean;
}

const MD_RE = /\.md$/i;
const EXCLUDED = new Set<string>(EXCLUDED_DIRS);
const isBlobMode = (mode: string) => (BLOB_MODES as readonly string[]).includes(mode);

function isDocPath(path: string): boolean {
  if (!MD_RE.test(path)) return false;
  return !path.split('/').some((seg) => EXCLUDED.has(seg));
}

/**
 * Resolve a symlink's text relative to the link's folder inside the tree.
 * Returns the normalised repo-relative path, or null when the target is
 * absolute, leaves the repo root or contains control characters.
 */
export function resolveTreeLink(linkPath: string, target: string): string | null {
  if (target.length === 0 || target.startsWith('/') || /[\0-\x1f]/.test(target)) return null;
  const parts = linkPath.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.length > 0 ? parts.join('/') : null;
}

/**
 * Documents of a tree listing (AC-1, AC-41, Q1 = A): `.md` regular/executable
 * blobs outside `EXCLUDED_DIRS`. A symlink is kept under its own path only when
 * it resolves (one hop) to such a regular document inside the tree; links that
 * are absolute, leave the root, chain or dangle are dropped. Submodules
 * (mode 160000) and anything else are dropped.
 */
export async function discoverDocs(
  entries: GitTreeEntry[],
  readLink?: ReadLink,
): Promise<DiscoveredDoc[]> {
  const regular = new Map<string, DiscoveredDoc>();
  const links: GitTreeEntry[] = [];
  for (const e of entries) {
    if (!isDocPath(e.path)) continue;
    if (isBlobMode(e.mode)) regular.set(e.path, { path: e.path, source: e.path, size: e.size });
    else if (e.mode === SYMLINK_MODE) links.push(e);
  }
  const docs = [...regular.values()];
  if (!readLink) return docs;
  for (const l of links) {
    const text = await readLink(l.path);
    if (text === null) continue;
    const resolved = resolveTreeLink(l.path, text);
    const target = resolved ? regular.get(resolved) : undefined;
    if (target) docs.push({ path: l.path, source: target.path, size: target.size });
  }
  return docs;
}

/** Top-level folder of a path, or 'root' for a file at the repo root (AC-2). */
export function categoryOf(path: string): string {
  const i = path.indexOf('/');
  return i === -1 ? 'root' : path.slice(0, i);
}

/** Token estimate: ceil(chars / 4). */
export function estTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

/**
 * The effective document list (AC-30): own paths first in their order, then the
 * effective skills' paths in skill order; each path once, at its first position.
 * `via` collects every skill that carries the path (EC-7, AC-46).
 */
export function effectiveDocList(
  own: string[],
  skills: { name: string; paths: string[] }[],
): EffectiveDoc[] {
  const byPath = new Map<string, EffectiveDoc>();
  for (const path of own) {
    if (!byPath.has(path)) byPath.set(path, { path, own: true, via: [] });
  }
  for (const s of skills) {
    for (const path of s.paths) {
      const doc = byPath.get(path);
      if (!doc) byPath.set(path, { path, own: false, via: [s.name] });
      else if (!doc.via.includes(s.name)) doc.via.push(s.name);
    }
  }
  return [...byPath.values()];
}

/**
 * Largest cut index ≤ `max` that doesn't split a UTF-16 surrogate pair: a lone
 * surrogate is rejected by Postgres jsonb (the trace) and by LLM APIs.
 */
function codePointCut(text: string, max: number): number {
  const code = text.charCodeAt(max - 1);
  return code >= 0xd800 && code <= 0xdbff ? max - 1 : max;
}

/**
 * Apply the limits (AC-36, AC-37): a text over `MAX_DOC_CHARS` is cut and gets
 * the visible marker; then the last documents are dropped while the counted
 * characters (marker excluded, Q2) exceed `MAX_TOTAL_CHARS`.
 */
export function fitDocs(docs: { path: string; text: string }[]): {
  injected: FittedDoc[];
  omitted: string[];
} {
  const injected: FittedDoc[] = [];
  const omitted: string[] = [];
  let used = 0;
  for (const d of docs) {
    const truncated = d.text.length > MAX_DOC_CHARS;
    const kept = truncated ? d.text.slice(0, codePointCut(d.text, MAX_DOC_CHARS)) : d.text;
    if (omitted.length > 0 || used + kept.length > MAX_TOTAL_CHARS) {
      omitted.push(d.path);
      continue;
    }
    used += kept.length;
    injected.push({
      path: d.path,
      text: truncated ? kept + truncationMarker(d.text.length) : d.text,
      truncated,
    });
  }
  return { injected, omitted };
}

/** Row token estimate (R2): the real text length when known, else the blob size. */
function rowTokens(doc: DiscoveredDoc | undefined, path: string, textLen?: Map<string, number>) {
  const len = textLen?.get(path);
  if (len !== undefined) return estTokens(len);
  return doc?.size != null ? estTokens(doc.size) : 0;
}

function availableRows(
  discovered: DiscoveredDoc[],
  taken: Set<string>,
  textLen?: Map<string, number>,
): ContextDocRow[] {
  return discovered
    .filter((d) => !taken.has(d.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((d) => ({
      path: d.path,
      category: categoryOf(d.path),
      tokens: rowTokens(d, d.path, textLen),
      state: 'available' as const,
      via: [],
    }));
}

/**
 * Agent Context-tab rows (AC-16): effective rows in prompt order — own +
 * discovered = `attached` (with `via`, AC-46), own + not discovered = `missing`
 * (AC-21), skill-only + discovered = `inherited` (AC-42) — then every other
 * discovered document as `available`, alphabetically. A skill-only path that is
 * no longer discovered has no row (only the skill can detach it).
 */
export function buildAgentRows(
  discovered: DiscoveredDoc[],
  own: string[],
  effective: EffectiveDoc[],
  textLen?: Map<string, number>,
): ContextDocRow[] {
  const ownSet = new Set(own);
  const byPath = new Map(discovered.map((d) => [d.path, d]));
  const rows: ContextDocRow[] = [];
  const taken = new Set<string>();
  for (const e of effective) {
    const doc = byPath.get(e.path);
    const isOwn = ownSet.has(e.path);
    if (!isOwn && !doc) continue;
    taken.add(e.path);
    rows.push({
      path: e.path,
      category: categoryOf(e.path),
      tokens: doc ? rowTokens(doc, e.path, textLen) : 0,
      state: isOwn ? (doc ? 'attached' : 'missing') : 'inherited',
      via: [...e.via],
    });
  }
  return [...rows, ...availableRows(discovered, taken, textLen)];
}

/** Skill Context-tab rows: own (attached/missing) in order, then the rest alphabetically. */
export function buildSkillRows(
  discovered: DiscoveredDoc[],
  own: string[],
  textLen?: Map<string, number>,
): ContextDocRow[] {
  return buildAgentRows(discovered, own, effectiveDocList(own, []), textLen);
}

/** Per path, how many agents have it in their effective list (AC-5). */
export function usedByCounts(effectivePathsPerAgent: string[][]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const paths of effectivePathsPerAgent) {
    for (const p of new Set(paths)) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return counts;
}
