import type { RepoRef, UnresolvedRef } from '@devdigest/shared';
import {
  DOC_DIRS,
  DOC_EXTENSIONS,
  EXTERNAL_HOSTS,
  ITEM_MAX_CHARS,
  MAX_DOCS,
  MAX_ISSUES,
  NOT_JIRA_PREFIXES,
} from './constants.js';
import type { DocRef, IssueRef } from './types.js';

/**
 * Reference extraction for the intent classifier (pure). Finds the issues and
 * plan/spec docs a PR points at, and the links that can't be read. Every ref
 * string built here comes from a charset-restricted regex capture, so it is safe
 * to name in logs and in the prompt's trusted "Missing context" section.
 */

export interface ExtractedRefs {
  /** Same-repo issues mentioned in the body (deduped, capped at MAX_ISSUES). */
  issues: IssueRef[];
  /** Same-repo docs (deduped, capped at MAX_DOCS). */
  docs: DocRef[];
  /** Refs that will not be read: other repo, unsafe path, tracker, over the cap. */
  unresolved: UnresolvedRef[];
}

const HTML_COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
const URL_RE = /https?:\/\/[^\s<>()[\]"'`]+/g;
const GITHUB_ISSUE_URL = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/(?:issues|pull)\/(\d{1,9})(?:[/?#].*)?$/i;
/** Captures owner, repo and everything after `blob/` (`<ref>/<path>`; the ref may contain `/`). */
const GITHUB_BLOB_URL = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/([^?#\s]+)/i;
/** Characters a doc path or a displayed ref may contain; anything else (control chars, quotes, `<>`) is refused. */
const SAFE_PATH_CHARS = /^[\w@.\-/ +~]+$/;
const CROSS_REPO_ISSUE = /(?<![\w/.-])([\w.-]+)\/([\w.-]+)#(\d{1,9})\b/g;
const SHORT_ISSUE = /(?<![\w/&#])#(\d{1,9})\b/g;
const DOC_EXT = DOC_EXTENSIONS.join('|');
const DOC_PATH = new RegExp(
  `(?<![\\w/.:@-])((?:\\.{1,2}\\/|\\/)?(?:[\\w@.-]+\\/)*[\\w@.-]+\\.(?:${DOC_EXT}))(?![\\w/-])`,
  'gi',
);
const JIRA_KEY = /\b([A-Z][A-Z0-9]{1,9})-(\d{1,6})\b/g;

/** Remove `<!-- … -->` blocks (templates, hidden notes) — also an unterminated one. */
export function stripHtmlComments(text: string): string {
  return text.replace(HTML_COMMENT, '');
}

/**
 * A repo-relative doc path we may read: no absolute path or drive letter, no `..`
 * segment, nothing under `.git/`, no `.env*` file or folder.
 */
export function isSafeDocPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:/.test(path)) return false;
  if (!SAFE_PATH_CHARS.test(path)) return false;
  const segments = path.split(/[\\/]/);
  return !segments.some(
    (seg) => seg === '..' || seg === '.git' || seg.toLowerCase().startsWith('.env'),
  );
}

/** Repo-root file, or inside a plan/spec folder (`DOC_DIRS`) at any depth. */
export function isPlanDocLocation(path: string): boolean {
  const dirs = path.split('/').slice(0, -1).map((d) => d.toLowerCase());
  return dirs.length === 0 || dirs.some((d) => (DOC_DIRS as readonly string[]).includes(d));
}

function sameRepo(repo: RepoRef | null, owner: string, name: string): boolean {
  return (
    !!repo &&
    repo.owner.toLowerCase() === owner.toLowerCase() &&
    repo.name.toLowerCase().replace(/\.git$/, '') === name.toLowerCase().replace(/\.git$/, '')
  );
}

function hasDocExtension(path: string): boolean {
  const dot = path.lastIndexOf('.');
  return dot >= 0 && (DOC_EXTENSIONS as readonly string[]).includes(path.slice(dot + 1).toLowerCase());
}

/** A ref string safe to show in the prompt and logs: disallowed chars → `?`, length-capped. */
function safeRef(text: string): string {
  return text.replace(/[^\w@.\-/ +~#:]/g, '?').slice(0, ITEM_MAX_CHARS);
}

/**
 * The repo path in `blob/<ref>/<path>`. A branch may contain `/`, so the PR's own
 * branch is matched first; a SHA or any other ref is taken as one segment
 * (another slashed branch can't be told apart without an API call).
 */
function blobPath(refAndPath: string, branch: string): string {
  if (branch && refAndPath.startsWith(`${branch}/`)) return refAndPath.slice(branch.length + 1);
  const slash = refAndPath.indexOf('/');
  return slash < 0 ? '' : refAndPath.slice(slash + 1);
}

/** `host/path` of a URL, restricted to a safe charset and length (display only). */
function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/[^\w.\-/~%]/g, '');
    return `${u.host}${path}`.slice(0, ITEM_MAX_CHARS);
  } catch {
    return 'invalid-url';
  }
}

function isTrackerHost(host: string): boolean {
  const h = host.toLowerCase();
  return EXTERNAL_HOSTS.some((ext) => h === ext || h.endsWith(`.${ext}`));
}

/** Collects refs with dedupe + caps as they are found, in text order. */
class RefCollector {
  readonly issues: IssueRef[] = [];
  readonly docs: DocRef[] = [];
  readonly unresolved: UnresolvedRef[] = [];
  private seen = new Set<string>();

  constructor(private readonly selfNumber: number) {}

  private once(key: string): boolean {
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }

  issue(n: number): void {
    if (n === this.selfNumber || !this.once(`issue:${n}`)) return;
    const ref = `#${n}`;
    if (this.issues.length >= MAX_ISSUES) {
      this.unresolved.push({ kind: 'issue', ref, reason: 'limit_reached' });
      return;
    }
    this.issues.push({ number: n, ref, kind: 'mentioned_issue' });
  }

  doc(rawPath: string): void {
    const path = rawPath.replace(/^(?:\.\/)+/, '');
    if (!this.once(`doc:${path}`)) return;
    const ref = safeRef(path);
    if (!isSafeDocPath(path)) {
      this.unresolved.push({ kind: 'doc', ref, reason: 'invalid_path' });
      return;
    }
    // A safe doc outside the repo root / plan folders (`client/INSIGHTS.md`,
    // `e2e/README.md`) is a file mention, not a linked plan: skip it silently —
    // reporting it would flag "context missing" for context nobody linked.
    if (!isPlanDocLocation(path)) return;
    if (this.docs.length >= MAX_DOCS) {
      this.unresolved.push({ kind: 'doc', ref, reason: 'limit_reached' });
      return;
    }
    this.docs.push({ path });
  }

  unresolvedRef(kind: UnresolvedRef['kind'], ref: string, reason: UnresolvedRef['reason']): void {
    if (!this.once(`${kind}:${ref}`)) return;
    this.unresolved.push({ kind, ref, reason });
  }
}

/**
 * Extract issue, doc and tracker refs from the PR title, body and branch.
 * - Issues: `#12`, `owner/repo#12`, `github.com/o/r/issues|pull/12` (same repo only;
 *   another repo → `external_repo`; the PR's own number is skipped).
 * - Docs: relative `*.md|mdx|markdown|txt|rst|adoc` paths and same-repo blob URLs
 *   (other repo → `external_repo`; unsafe path → `invalid_path`; a safe path outside
 *   the repo root and `DOC_DIRS` is ignored).
 * - Trackers: Linear / Jira / Notion URLs and Jira keys in branch or title →
 *   `no_credentials` (never fetched).
 * HTML comments are ignored. Over the caps → `limit_reached`.
 */
export function extractRefs(input: {
  title: string;
  body: string | null;
  branch: string;
  repo: RepoRef | null;
  prNumber: number;
}): ExtractedRefs {
  const out = new RefCollector(input.prNumber);
  let body = stripHtmlComments(input.body ?? '');
  // Refs are applied in TEXT order (caps keep the first ones mentioned). Matched
  // spans are blanked with same-length spaces so later passes neither re-read them
  // nor shift the offsets.
  const found: { at: number; apply: () => void }[] = [];
  const blank = (s: string) => ' '.repeat(s.length);

  // 1. URLs first — their paths must not be read again as docs/issues.
  body = body.replace(URL_RE, (raw: string, at: number) => {
    const url = raw.replace(/[.,;:!?]+$/, '');
    const issue = url.match(GITHUB_ISSUE_URL);
    const blob = issue ? null : url.match(GITHUB_BLOB_URL);
    if (issue) {
      const [, owner = '', name = '', num = ''] = issue;
      found.push({
        at,
        apply: () =>
          sameRepo(input.repo, owner, name)
            ? out.issue(Number(num))
            : out.unresolvedRef('issue', `${owner}/${name}#${num}`.slice(0, ITEM_MAX_CHARS), 'external_repo'),
      });
    } else if (blob) {
      const [, owner = '', name = '', refAndPath = ''] = blob;
      const path = blobPath(refAndPath, input.branch);
      let decoded = path;
      try {
        decoded = decodeURIComponent(path);
      } catch {
        /* keep the raw path */
      }
      if (hasDocExtension(decoded)) {
        found.push({
          at,
          apply: () =>
            sameRepo(input.repo, owner, name)
              ? out.doc(decoded)
              : out.unresolvedRef('doc', displayUrl(url), 'external_repo'),
        });
      }
    } else {
      let host = '';
      try {
        host = new URL(url).host;
      } catch {
        /* not a URL after all */
      }
      if (host && isTrackerHost(host)) {
        found.push({ at, apply: () => out.unresolvedRef('external', displayUrl(url), 'no_credentials') });
      }
    }
    return blank(raw);
  });

  // 2. `owner/repo#12` before `#12`, so the short form doesn't also match it.
  body = body.replace(CROSS_REPO_ISSUE, (m: string, owner: string, name: string, num: string, at: number) => {
    found.push({
      at,
      apply: () =>
        sameRepo(input.repo, owner, name)
          ? out.issue(Number(num))
          : out.unresolvedRef('issue', `${owner}/${name}#${num}`.slice(0, ITEM_MAX_CHARS), 'external_repo'),
    });
    return blank(m);
  });
  for (const m of body.matchAll(SHORT_ISSUE)) {
    found.push({ at: m.index ?? 0, apply: () => out.issue(Number(m[1])) });
  }

  // 3. Relative doc paths.
  for (const m of body.matchAll(DOC_PATH)) {
    const path = m[1];
    if (path) found.push({ at: m.index ?? 0, apply: () => out.doc(path) });
  }

  for (const f of found.sort((a, b) => a.at - b.at)) f.apply();

  // 4. Jira keys in branch or title (never fetched).
  for (const text of [input.branch, input.title]) {
    for (const m of text.matchAll(JIRA_KEY)) {
      const prefix = m[1] ?? '';
      if ((NOT_JIRA_PREFIXES as readonly string[]).includes(prefix)) continue;
      out.unresolvedRef('external', `${prefix}-${m[2]}`, 'no_credentials');
    }
  }

  return { issues: out.issues, docs: out.docs, unresolved: out.unresolved };
}
