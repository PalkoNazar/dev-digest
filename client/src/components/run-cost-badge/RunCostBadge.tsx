/* RunCostBadge — what a review run (or a PR's last review round) cost (L01). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { formatUsd, totalTokens } from "./helpers";
import { s } from "./styles";

/**
 * Two variants:
 * - `compact` → `$0.014` (PR list COST column)
 * - `full`    → `9,119 tok · $0.0013` (timeline run card)
 * Unknown cost renders "—" (never "$0.00"). No LLM calls — display only.
 */
export function RunCostBadge({
  usd,
  variant = "compact",
  tokensIn,
  tokensOut,
}: {
  usd: number | null | undefined;
  variant?: "compact" | "full";
  tokensIn?: number | null;
  tokensOut?: number | null;
}) {
  const t = useTranslations("common.runCost");
  const cost = formatUsd(usd);
  const tokens = variant === "full" ? totalTokens(tokensIn, tokensOut) : null;
  return (
    <span className="mono" style={s.badge} title={usd == null ? t("unknown") : t("label")}>
      {tokens != null && (
        <>
          {t("tokens", { count: tokens })}
          <span style={s.sep}>·</span>
        </>
      )}
      {cost}
    </span>
  );
}
