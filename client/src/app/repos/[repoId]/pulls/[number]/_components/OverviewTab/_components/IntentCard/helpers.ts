import type { IntentPromptComponent, IntentSource, PrIntentRecord } from "@devdigest/shared";

/** Estimated classifier prompt size: the sum of every component's `est_tokens`. */
export function totalEstTokens(components: IntentPromptComponent[]): number {
  return components.reduce((sum, c) => sum + c.est_tokens, 0);
}

/** True when the PR description was not among the classifier's inputs (empty body). */
export function lacksDescription(intent: Pick<PrIntentRecord, "mode" | "sources_used">): boolean {
  // A fallback never reads the body, so its sources can't tell us whether one exists.
  return intent.mode === "llm" && !intent.sources_used.some((src) => src.kind === "body");
}

/** `provider/model` of the classifier call, or null for a fallback without a model. */
export function modelLabel(intent: Pick<PrIntentRecord, "provider" | "model">): string | null {
  if (!intent.model) return null;
  return intent.provider ? `${intent.provider}/${intent.model}` : intent.model;
}

/** Sources whose `ref` names something specific (issue number, doc path) worth showing. */
export function showsRef(src: IntentSource): boolean {
  return src.kind === "linked_issue" || src.kind === "mentioned_issue" || src.kind === "spec_doc";
}
