import type { IconName } from "@devdigest/ui";

/** Skill detail tabs. `labelKey` resolves under the `skills` namespace. Evals
    (mockup) arrives with a later lesson. */
export const DETAIL_TABS: readonly { key: string; labelKey: string; icon: IconName }[] = [
  { key: "config", labelKey: "detail.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "detail.tabs.preview", icon: "Eye" },
  { key: "stats", labelKey: "detail.tabs.stats", icon: "BarChart" },
  { key: "versions", labelKey: "detail.tabs.versions", icon: "History" },
];
