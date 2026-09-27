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
