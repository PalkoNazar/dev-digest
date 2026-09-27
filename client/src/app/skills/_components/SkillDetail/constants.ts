import type { IconName } from "@devdigest/ui";

/** Skill detail tabs. `labelKey` resolves under the `skills` namespace. Evals and
    Stats (mockup) arrive with later lessons. */
export const DETAIL_TABS: readonly { key: string; labelKey: string; icon: IconName }[] = [
  { key: "config", labelKey: "detail.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "detail.tabs.preview", icon: "Eye" },
  { key: "versions", labelKey: "detail.tabs.versions", icon: "History" },
];
