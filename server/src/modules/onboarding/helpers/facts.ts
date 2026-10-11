import type { OnboardingRunStep } from '@devdigest/shared';
import {
  COMPOSE_FILES,
  ENV_EXAMPLE_FILE,
  EXCLUDED_DIRS,
  LOCKFILES,
  READING_PATH_EXCLUDE_PATTERNS,
  READING_PATH_EXCLUDE_SEGMENTS,
  READING_PATH_MAX,
  README_MAX_CHARS,
  SUPPORTED_EXT,
} from '../constants.js';
import type { PackageManager, TourFacts } from '../types.js';

/**
 * Deterministic facts of the Onboarding Tour (plan S7). Pure: tree paths and file
 * texts in, facts out — the service does the reads. AC-24…AC-27, AC-39, AC-45,
 * AC-81, AC-85, EC-3, EC-5, EC-15, EC-23.
 */

const EXCLUDED_SET: ReadonlySet<string> = new Set(EXCLUDED_DIRS);
const SUPPORTED_SET: ReadonlySet<string> = new Set(SUPPORTED_EXT);
const READING_SEGMENTS: ReadonlySet<string> = new Set(READING_PATH_EXCLUDE_SEGMENTS);

function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

function dirSegments(path: string): string[] {
  return path.split('/').slice(0, -1);
}

/** Files the index can parse: a `SUPPORTED_EXT` file outside `EXCLUDED_DIRS` (AC-39). */
export function sourceCandidates(treePaths: readonly string[]): string[] {
  return treePaths.filter(
    (p) => SUPPORTED_SET.has(extOf(p)) && !dirSegments(p).some((s) => EXCLUDED_SET.has(s)),
  );
}

/**
 * One entry per top-level directory (excluded dirs left out), with the number of
 * indexed files under it (AC-45). Sorted by path.
 */
export function topLevelFolders(
  treePaths: readonly string[],
  indexed: ReadonlySet<string>,
): { path: string; files: number }[] {
  const counts = new Map<string, number>();
  for (const p of treePaths) {
    const slash = p.indexOf('/');
    if (slash <= 0) continue;
    const top = p.slice(0, slash);
    if (EXCLUDED_SET.has(top)) continue;
    counts.set(top, (counts.get(top) ?? 0) + (indexed.has(p) ? 1 : 0));
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, files]) => ({ path, files }));
}

/** Root lockfile → package manager; `npm` with a root `package.json` and no lockfile (Q2). */
export function detectPackageManager(treePaths: readonly string[]): PackageManager | null {
  const root = new Set(treePaths);
  if (!root.has('package.json')) return null;
  for (const [file, pm] of Object.entries(LOCKFILES)) {
    if (root.has(file)) return pm;
  }
  return 'npm';
}

/** The root compose file, if any. */
export function findComposeFile(treePaths: readonly string[]): string | null {
  const root = new Set(treePaths);
  return COMPOSE_FILES.find((f) => root.has(f)) ?? null;
}

/** Service names under the top-level `services:` key of a compose file (line parser). */
export function composeServices(text: string): string[] {
  const out: string[] = [];
  let inServices = false;
  let indent: number | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const lead = line.length - line.trimStart().length;
    if (lead === 0) {
      inServices = /^services\s*:\s*$/.test(line);
      indent = null;
      continue;
    }
    if (!inServices) continue;
    if (indent === null) indent = lead;
    if (lead !== indent) continue;
    const m = /^\s*["']?([\w.-]+)["']?\s*:/.exec(line);
    if (m?.[1]) out.push(m[1]);
  }
  return out;
}

/** Presence of `.env.example` only — a committed `.env` is never a fact (EC-15). */
export function hasEnvExample(treePaths: readonly string[]): boolean {
  return treePaths.includes(ENV_EXAMPLE_FILE);
}

/** The `scripts` of a `package.json` text; `{}` on any malformed input. */
export function parseScripts(pkgJson: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(pkgJson);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object') return {};
  const scripts = (parsed as { scripts?: unknown }).scripts;
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) return {};
  const out: Record<string, string> = {};
  for (const [name, cmd] of Object.entries(scripts as Record<string, unknown>)) {
    // `__proto__` would replace the prototype instead of adding a key.
    if (typeof cmd === 'string' && name !== '__proto__') out[name] = cmd;
  }
  return out;
}

const LANGUAGES: ReadonlyArray<[string, readonly string[]]> = [
  ['TypeScript', ['.ts', '.tsx', '.mts', '.cts']],
  ['JavaScript', ['.js', '.jsx', '.mjs', '.cjs']],
  ['Python', ['.py']],
  ['Go', ['.go']],
  ['Rust', ['.rs']],
  ['Java', ['.java']],
  ['Kotlin', ['.kt']],
  ['Ruby', ['.rb']],
  ['PHP', ['.php']],
  ['C#', ['.cs']],
];

const FRAMEWORKS: ReadonlyArray<[string, string]> = [
  ['next', 'Next.js'],
  ['react', 'React'],
  ['vue', 'Vue'],
  ['svelte', 'Svelte'],
  ['@angular/core', 'Angular'],
  ['fastify', 'Fastify'],
  ['express', 'Express'],
  ['@nestjs/core', 'NestJS'],
  ['koa', 'Koa'],
  ['hono', 'Hono'],
  ['drizzle-orm', 'Drizzle'],
  ['prisma', 'Prisma'],
  ['@prisma/client', 'Prisma'],
  ['typeorm', 'TypeORM'],
  ['vite', 'Vite'],
  ['vitest', 'Vitest'],
  ['jest', 'Jest'],
];

/** Languages by file extension, frameworks from root dependency names, Docker (AC-24). */
export function detectStack(rootPkg: string | null, treePaths: readonly string[]): string[] {
  const stack: string[] = [];
  const exts = new Set(
    treePaths.filter((p) => !dirSegments(p).some((s) => EXCLUDED_SET.has(s))).map(extOf),
  );
  for (const [lang, langExts] of LANGUAGES) {
    if (langExts.some((e) => exts.has(e))) stack.push(lang);
  }
  if (rootPkg) {
    let deps: Record<string, unknown> = {};
    try {
      const pkg = JSON.parse(rootPkg) as Record<string, unknown>;
      for (const key of ['dependencies', 'devDependencies']) {
        const d = pkg?.[key];
        if (d && typeof d === 'object' && !Array.isArray(d)) deps = { ...deps, ...d };
      }
    } catch {
      deps = {};
    }
    for (const [dep, name] of FRAMEWORKS) {
      if (dep in deps && !stack.includes(name)) stack.push(name);
    }
  }
  if (treePaths.some((p) => p === 'Dockerfile' || p.endsWith('/Dockerfile'))) stack.push('Docker');
  if (findComposeFile(treePaths)) stack.push('Docker Compose');
  return stack;
}

const README_RE = /^readme(\.(md|markdown|mdx|txt|rst))?$/i;

/** The root README (case-insensitive, `README.md` first), null without one (EC-23). */
export function readmePath(treePaths: readonly string[]): string | null {
  const roots = treePaths.filter((p) => !p.includes('/') && README_RE.test(p));
  return roots.find((p) => p === 'README.md') ?? roots[0] ?? null;
}

/**
 * Largest cut index ≤ `max` that doesn't split a UTF-16 surrogate pair. Copy of
 * `project-context/helpers.ts` `codePointCut` — a lone surrogate is rejected by
 * Postgres jsonb and LLM APIs.
 */
export function codePointCut(text: string, max: number): number {
  if (text.length <= max) return text.length;
  const code = text.charCodeAt(max - 1);
  return code >= 0xd800 && code <= 0xdbff ? max - 1 : max;
}

/** The first `README_MAX_CHARS` characters, never splitting an emoji (AC-85). */
export function capReadme(text: string): string {
  return text.slice(0, codePointCut(text, README_MAX_CHARS));
}

function excludedFromReading(path: string): boolean {
  if (dirSegments(path).some((s) => READING_SEGMENTS.has(s) || EXCLUDED_SET.has(s))) return true;
  const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  return READING_PATH_EXCLUDE_PATTERNS.some((p) => base.includes(p));
}

/**
 * The reading path: the ranked pool minus tests, configs, declarations, generated
 * code and non-files, in rank order, at most `READING_PATH_MAX` (AC-25…AC-27).
 */
export function readingPath(rankedPool: readonly string[], fileSet: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const p of rankedPool) {
    if (out.length >= READING_PATH_MAX) break;
    if (!fileSet.has(p) || out.includes(p) || excludedFromReading(p)) continue;
    out.push(p);
  }
  return out;
}

/** The slice of a blast-radius result the routes fact reads (Q8). */
export interface RoutesBlastInput {
  callers: ReadonlyArray<{ file: string; rank: number }>;
  factsByFile?: Record<string, { endpoints: string[] }> | undefined;
}

/**
 * Endpoints of the caller files, ordered by the highest caller rank of their file,
 * deduped and capped at `max` (AC-24, Q8). Empty on a degraded result.
 */
export function routesFromBlast(blast: RoutesBlastInput, max: number): string[] {
  const facts = blast.factsByFile ?? {};
  const rankOf = new Map<string, number>();
  for (const c of blast.callers) {
    rankOf.set(c.file, Math.max(rankOf.get(c.file) ?? -Infinity, c.rank));
  }
  const files = Object.keys(facts).sort((a, b) => {
    const d = (rankOf.get(b) ?? -Infinity) - (rankOf.get(a) ?? -Infinity);
    if (d !== 0 && !Number.isNaN(d)) return d;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const out: string[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    for (const e of facts[f]?.endpoints ?? []) {
      if (out.length >= max) return out;
      if (seen.has(e)) continue;
      seen.add(e);
      out.push(e);
    }
  }
  return out;
}

/** `<pm> <script>` the way each package manager runs a named script. */
export function runScriptCommand(pm: PackageManager, script: string): string {
  return pm === 'npm' || pm === 'bun' ? `${pm} run ${script}` : `${pm} ${script}`;
}

/**
 * The deterministic "How to run locally" steps (AC-81): install, copy
 * `.env.example`, start compose, then the root `dev` (else `start`) script.
 */
export function deterministicRunSteps(
  facts: Pick<TourFacts, 'packageManager' | 'hasEnvExample' | 'composeFile' | 'scriptsByDir'>,
): OnboardingRunStep[] {
  const steps: string[] = [];
  const pm = facts.packageManager;
  if (pm) steps.push(`${pm} install`);
  if (facts.hasEnvExample) steps.push(`cp ${ENV_EXAMPLE_FILE} .env`);
  if (facts.composeFile) steps.push('docker compose up -d');
  if (pm) {
    const root = facts.scriptsByDir['.'] ?? {};
    const script = Object.hasOwn(root, 'dev') ? 'dev' : Object.hasOwn(root, 'start') ? 'start' : null;
    if (script) steps.push(runScriptCommand(pm, script));
  }
  return steps.map((command) => ({ command }));
}
