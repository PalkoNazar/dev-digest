import type { ChatMessage, IntentPromptComponent, UnresolvedRef } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import { estTokens } from './helpers.js';
import type { ContextText, FetchedDoc, FetchedIssue, FileSummary } from './types.js';

/**
 * The intent-classifier prompt (pure). Instructions are the trusted template
 * (`src/prompts/intent.system.md`); every author/repo-derived source goes into an
 * `<untrusted>` block under a FIXED label — a path or title could contain `"` or
 * `</untrusted>`, so it lives inside the wrapped content, never in the label.
 * "Missing context" is trusted text (the instruction), but the unresolved ref
 * strings it lists came from the PR body, so they sit in their own untrusted block.
 */

export interface IntentPromptInput {
  system: string;
  title: string;
  /** Body after HTML-comment stripping and the budget; empty → "No PR description". */
  body: ContextText;
  branch: string;
  issues: FetchedIssue[];
  docs: FetchedDoc[];
  files: FileSummary[];
  unresolved: UnresolvedRef[];
}

const REASON_TEXT: Record<UnresolvedRef['reason'], string> = {
  not_found: 'not found at the PR head',
  too_large: 'too large to read',
  invalid_path: 'unsafe path, not read',
  external_repo: 'in another repository, not read',
  no_credentials: 'external tracker, no credentials',
  no_github_token: 'no GitHub token configured',
  fetch_failed: 'fetch failed',
  limit_reached: 'over the source limit, not read',
};

function filesText(files: FileSummary[]): string {
  if (files.length === 0) return '(no changed files available)';
  return files
    .map((f) => [`${f.path} (+${f.additions} −${f.deletions})`, ...f.hunks.map((h) => `  ${h}`)].join('\n'))
    .join('\n');
}

function missingSection(unresolved: UnresolvedRef[], noBody: boolean): string | null {
  if (unresolved.length === 0 && !noBody) return null;
  const parts = [
    '## Missing context',
    'These sources were referenced or expected but could NOT be read. Do not guess their content; name the gap in `context_gaps` and keep the summary hedged.',
  ];
  if (noBody) parts.push('- No PR description.');
  if (unresolved.length > 0) {
    const refs = unresolved.map((u) => `- ${u.kind} ${u.ref}: ${REASON_TEXT[u.reason]}`).join('\n');
    parts.push(wrapUntrusted('unresolved-refs', refs));
  }
  return parts.join('\n');
}

function component(
  kind: IntentPromptComponent['component'],
  text: string,
  ref: string | null,
  truncated: boolean,
): IntentPromptComponent {
  return { component: kind, ref, chars: text.length, est_tokens: estTokens(text.length), truncated };
}

/** Build the classifier messages and the size of each prompt component (sizes only, never text). */
export function buildIntentMessages(input: IntentPromptInput): {
  messages: ChatMessage[];
  components: IntentPromptComponent[];
} {
  const components: IntentPromptComponent[] = [];
  const sections: string[] = [
    'Classify the intent of this pull request from the sources below.',
  ];
  const add = (
    kind: IntentPromptComponent['component'],
    section: string,
    ref: string | null = null,
    truncated = false,
  ) => {
    sections.push(section);
    components.push(component(kind, section, ref, truncated));
  };

  add('title', `## PR title\n${wrapUntrusted('pr-title', input.title)}`);
  const hasBody = input.body.text.trim().length > 0;
  if (hasBody) {
    add('body', `## PR description\n${wrapUntrusted('pr-body', input.body.text)}`, null, input.body.truncated);
  }
  add('branch', `## Branch\n${wrapUntrusted('branch', input.branch)}`);
  for (const i of input.issues) {
    add(
      'issue',
      `## Issue\n${wrapUntrusted('issue', `Ref: ${i.ref} — ${i.title}\n${i.text}`)}`,
      i.ref,
      i.truncated,
    );
  }
  for (const d of input.docs) {
    add('doc', `## Plan / spec document\n${wrapUntrusted('doc', `Path: ${d.path}\n${d.text}`)}`, d.path, d.truncated);
  }
  add(
    'files',
    `## Changed files (paths, +/− line counts and hunk headers only)\n${wrapUntrusted('changed-files', filesText(input.files))}`,
    String(input.files.length),
  );

  const missing = missingSection(input.unresolved, !hasBody);
  if (missing) sections.push(missing);

  return {
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: sections.join('\n\n') },
    ],
    components,
  };
}
