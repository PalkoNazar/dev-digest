/* IntentLine — one-line derived PR intent above the review runs on the Findings
   tab: confidence, the summary (full text as a tooltip), a context-missing marker.
   Renders nothing until an intent exists; refreshed by the run's `intent_ready`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { usePrIntent } from "@/lib/hooks/intent";
import { INTENT_CONFIDENCE_TONE } from "../../../../constants";
import { s } from "./styles";

export function IntentLine({ prId }: { prId: string }) {
  const t = useTranslations("prReview");
  const { data } = usePrIntent(prId);
  const intent = data?.intent;
  if (!intent) return null;

  return (
    <div style={s.line} data-testid="intent-line">
      <span style={s.label}>{t("intentLine.label")}</span>
      <Badge {...INTENT_CONFIDENCE_TONE[intent.confidence]}>
        {t(`intentLine.confidence.${intent.confidence}`)}
      </Badge>
      <span style={s.summary} title={intent.summary}>
        {intent.summary}
      </span>
      {intent.missing_context && (
        <span style={s.missing}>
          <Icon.AlertTriangle size={12} />
          {t("intentLine.contextMissing")}
        </span>
      )}
    </div>
  );
}
