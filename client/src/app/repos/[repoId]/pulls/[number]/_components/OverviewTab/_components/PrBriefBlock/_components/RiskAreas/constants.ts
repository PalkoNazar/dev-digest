import type { IconName } from "@devdigest/ui";
import type { RiskSeverity } from "@devdigest/shared";

/** Icon + colour per risk severity (colour is never the only signal — see the sr text). */
export const RISK_SEVERITY_META: Record<RiskSeverity, { icon: IconName; color: string }> = {
  high: { icon: "AlertOctagon", color: "var(--crit)" },
  medium: { icon: "AlertTriangle", color: "var(--warn)" },
  low: { icon: "Info", color: "var(--info)" },
};
