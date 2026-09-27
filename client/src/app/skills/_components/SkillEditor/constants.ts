import type { SkillDraft } from "../../helpers";

/** A new skill starts enabled, as a rubric, with empty text. */
export const EMPTY_DRAFT: SkillDraft = {
  name: "",
  description: "",
  type: "rubric",
  body: "",
  enabled: true,
};
