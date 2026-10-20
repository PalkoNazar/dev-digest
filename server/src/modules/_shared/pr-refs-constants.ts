/**
 * PR reference extraction — tunables shared by the intent layer
 * (`reviews/intent`) and the PR Brief (`brief`). Pure constants, no I/O.
 * Spec: specs/2026-09-29-intent-layer.md
 */

/** At most this many issues are read per PR (linked first, then mentioned). */
export const MAX_ISSUES = 3;
export const MAX_DOCS = 3;
/** An issue body is cut to this many chars before it enters a prompt. */
export const ISSUE_MAX_CHARS = 3000;
/** A displayed ref (issue, doc path, URL) is cut to this length. */
export const REF_MAX_CHARS = 120;

/** Extensions a linked file must have to be read as a plan/spec doc. */
export const DOC_EXTENSIONS = ['md', 'mdx', 'markdown', 'rst', 'adoc'] as const;

/**
 * A linked doc is read only from a plan/spec location: a file at the repo root
 * (README.md, DESIGN.md…) or under one of these folders at any depth. The body is
 * author-controlled, so a bare path must not pull an arbitrary repo file into the
 * external classifier's prompt.
 */
export const DOC_DIRS = ['specs', 'spec', 'docs', 'doc', 'plans', 'plan', 'adr', 'adrs', 'rfcs', 'rfc', 'design'] as const;

/** Tracker hosts that are never fetched (no credentials) → unresolved `no_credentials`. */
export const EXTERNAL_HOSTS = ['linear.app', 'atlassian.net', 'notion.so', 'notion.site'] as const;

/** Upper-case prefixes that look like Jira keys but are standards (`UTF-8`, `SHA-256`…). */
export const NOT_JIRA_PREFIXES = [
  'UTF',
  'SHA',
  'ISO',
  'RFC',
  'CVE',
  'CWE',
  'HTTP',
  'TLS',
  'SSL',
  'ES',
  'IPV',
  'GPT',
  'OWASP',
] as const;
