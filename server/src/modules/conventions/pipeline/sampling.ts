import {
  CONFIG_DIR_COUNT,
  CONFIG_FILES,
  SAMPLE_MAX_LINE_CHARS,
  SAMPLE_MAX_LINES,
} from '../constants.js';

/**
 * Sample selection — pure code, no model. The ranked list (repo-intel PageRank) is
 * dominated by a few hub files of one layer; picking round-robin across
 * `<top folder>:<layer>` buckets shows the model routes AND services AND UI, so it
 * can see conventions that hold across the codebase, not inside one hub.
 */

const LAYERS: [string, RegExp][] = [
  ['api', /(^|\/)(routes?|controllers?|handlers?|api|endpoints?)(\/|\.|$)/],
  ['service', /service/],
  ['data', /(repositor|(^|\/)db\/|schema|(^|\/)models?\/|migrat)/],
  ['adapter', /(^|\/)(adapters?|clients?|integrations?|providers?)\//],
  ['hooks', /(^|\/)hooks?\//],
  ['ui', /((^|\/)components?\/|\.tsx$|\.jsx$|\.vue$|\.svelte$)/],
  ['lib', /(^|\/)(lib|utils?|helpers?|shared)\//],
];

/** `<top folder>:<layer>` bucket of a repo-relative path. */
export function bucketOf(path: string): string {
  const p = path.toLowerCase();
  const cut = p.indexOf('/');
  const top = cut === -1 ? '.' : p.slice(0, cut);
  // the top folder is already in the key — `client/` must not read as the adapter layer
  const rest = p.slice(cut + 1);
  const hook = /(^|\/)use[A-Z]\w*\.[jt]sx?$/.test(path);
  const layer = hook ? 'hooks' : (LAYERS.find(([, re]) => re.test(rest))?.[0] ?? 'other');
  return `${top}:${layer}`;
}

/** Up to `n` paths, round-robin over buckets; buckets and their files keep rank order. */
export function stratify(ranked: string[], n: number): string[] {
  const buckets = new Map<string, string[]>();
  for (const path of ranked) {
    const key = bucketOf(path);
    const list = buckets.get(key);
    if (list) list.push(path);
    else buckets.set(key, [path]);
  }
  const queues = [...buckets.values()];
  const out: string[] = [];
  while (out.length < n && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const next = q.shift();
      if (next !== undefined) out.push(next);
      if (out.length >= n) break;
    }
  }
  return out;
}

/** Tooling config paths to try: the repo root plus the first top-level folders. */
export function configCandidatePaths(ranked: string[]): string[] {
  const dirs: string[] = [];
  for (const path of ranked) {
    if (!path.includes('/')) continue;
    const top = path.slice(0, path.indexOf('/'));
    if (!dirs.includes(top)) dirs.push(top);
    if (dirs.length >= CONFIG_DIR_COUNT) break;
  }
  return ['', ...dirs].flatMap((d) => CONFIG_FILES.map((f) => (d ? `${d}/${f}` : f)));
}

/** File text as the model sees it: capped, each line prefixed with its 1-based number. */
export function numberLines(content: string): string {
  const lines = content.split('\n');
  const shown = lines.slice(0, SAMPLE_MAX_LINES).map((line, i) => {
    const text = line.length > SAMPLE_MAX_LINE_CHARS ? `${line.slice(0, SAMPLE_MAX_LINE_CHARS)}…` : line;
    return `${String(i + 1).padStart(4)}| ${text}`;
  });
  if (lines.length > SAMPLE_MAX_LINES) {
    shown.push(`    … (${lines.length - SAMPLE_MAX_LINES} more lines not shown)`);
  }
  return shown.join('\n');
}

/** Repo-relative, forward slashes, no leading `./` or `/`. */
export function normalizePath(path: string): string {
  return path.trim().replaceAll('\\', '/').replace(/^(\.\/|\/)+/, '');
}
