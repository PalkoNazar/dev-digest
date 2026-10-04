import type { SmartDiffRole } from "@devdigest/shared";

/** i18n keys (namespace `prReview`) and marker colour per file role. */
export const ROLE_META: Record<SmartDiffRole, { labelKey: string; hintKey: string; color: string }> = {
  core: { labelKey: "smartDiff.coreLabel", hintKey: "smartDiff.coreHint", color: "var(--accent)" },
  tests: { labelKey: "smartDiff.testsLabel", hintKey: "smartDiff.testsHint", color: "var(--ok)" },
  wiring: { labelKey: "smartDiff.wiringLabel", hintKey: "smartDiff.wiringHint", color: "var(--info)" },
  docs: { labelKey: "smartDiff.docsLabel", hintKey: "smartDiff.docsHint", color: "var(--sugg)" },
  boilerplate: {
    labelKey: "smartDiff.boilerplateLabel",
    hintKey: "smartDiff.boilerplateHint",
    color: "var(--text-muted)",
  },
};

/** Groups that start collapsed: rarely worth reading first. */
export const DEFAULT_COLLAPSED: ReadonlySet<SmartDiffRole> = new Set<SmartDiffRole>(["docs", "boilerplate"]);

/** px from the top where a group header sticks — below the sticky PrDetailHeader
 *  (z-index 5, variable height; estimate, tune by eye). */
export const ROLE_HEADER_STICKY_TOP = 136;
