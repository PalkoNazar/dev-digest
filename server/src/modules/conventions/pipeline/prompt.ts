import type { ChatMessage, ConventionStatus } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import { CONFIG_MAX_CHARS, KNOWN_RULES_IN_PROMPT } from '../constants.js';
import type { SampleFile, ToolingFact } from '../types.js';
import { numberLines } from './sampling.js';

/**
 * The extraction prompt. Instructions are the trusted template
 * (`src/prompts/conventions.system.md`); everything read from the repo goes inside
 * `<untrusted>` blocks — a repo file can say "ignore previous instructions" too.
 */

export interface KnownRule {
  rule: string;
  status: Exclude<ConventionStatus, 'pending'>;
}

function toolingSection(facts: ToolingFact[]): string {
  if (facts.length === 0) return 'No formatter, linter or strict tsconfig found.';
  const bySource = new Map<string, string[]>();
  for (const f of facts) {
    const key = `${f.tool} (${f.source})`;
    bySource.set(key, [...(bySource.get(key) ?? []), f.topic]);
  }
  return [...bySource].map(([src, topics]) => `- ${src}: ${topics.join(', ')}`).join('\n');
}

function knownSection(known: KnownRule[]): string {
  if (known.length === 0) return 'None yet.';
  return known
    .slice(0, KNOWN_RULES_IN_PROMPT)
    .map((k) => `- [${k.status}] ${k.rule}`)
    .join('\n');
}

export function buildMessages(input: {
  system: string;
  repoName: string;
  samples: SampleFile[];
  configs: SampleFile[];
  facts: ToolingFact[];
  known: KnownRule[];
}): ChatMessage[] {
  const configs = input.configs
    .map((c) => wrapUntrusted(`config:${c.path}`, c.content.slice(0, CONFIG_MAX_CHARS)))
    .join('\n\n');
  const samples = input.samples
    .map((s) => wrapUntrusted(`${s.kind}:${s.path}`, numberLines(s.content)))
    .join('\n\n');
  const user = [
    `Repository: ${input.repoName}`,
    '## Already enforced by tooling — do NOT propose rules about these',
    toolingSection(input.facts),
    '## Rules the user already decided on — do NOT propose these (or rephrasings) again',
    knownSection(input.known),
    '## Tooling configs',
    configs || 'None found.',
    '## Sample files (line-numbered; cite these numbers)',
    samples,
  ].join('\n\n');
  return [
    { role: 'system', content: input.system },
    { role: 'user', content: user },
  ];
}
