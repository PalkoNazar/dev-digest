import { SkillCreate, type SkillType } from "@devdigest/shared";

/** The modal's editable fields (the name may target an existing skill → update). */
export interface SkillFromConventionsDraft {
  name: string;
  description: string;
  type: SkillType;
  enabled: boolean;
  body: string;
}

export type DraftErrors = Partial<Record<"name" | "description" | "body", true>>;

/** Validate against the API's own contract, one flag per invalid field. */
export function draftErrors(draft: SkillFromConventionsDraft): DraftErrors {
  const res = SkillCreate.safeParse({ ...draft, source: "extracted" });
  if (res.success) return {};
  const errors: DraftErrors = {};
  for (const issue of res.error.issues) {
    const field = issue.path[0];
    if (field === "name" || field === "description" || field === "body") errors[field] = true;
  }
  return errors;
}
