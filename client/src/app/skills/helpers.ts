import { SkillCreate } from "@devdigest/shared";

/** Editable fields of a skill (the editor form and the import preview). */
export interface SkillDraft {
  name: string;
  description: string;
  type: SkillCreate["type"];
  body: string;
  enabled: boolean;
}

export type SkillDraftErrors = Partial<Record<"name" | "description" | "body", string>>;

/**
 * Validate a draft against the same Zod contract the API uses, so the form
 * shows the server's rules inline. Returns the first message per field.
 */
export function validateSkillDraft(draft: SkillDraft): SkillDraftErrors {
  const res = SkillCreate.safeParse(draft);
  if (res.success) return {};
  const errors: SkillDraftErrors = {};
  for (const issue of res.error.issues) {
    const field = issue.path[0];
    if ((field === "name" || field === "description" || field === "body") && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

/** Rough token count for the editor (≈ 4 chars per token; the run trace has the exact one). */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Whether the form differs from the saved skill. */
export function isDirty(saved: SkillDraft, draft: SkillDraft): boolean {
  return (
    saved.name !== draft.name ||
    saved.description !== draft.description ||
    saved.type !== draft.type ||
    saved.body !== draft.body ||
    saved.enabled !== draft.enabled
  );
}
