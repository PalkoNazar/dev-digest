/* TourAction — the page's one generation control: Generate (no tour) or Regenerate,
   "Generating…" disabled while a generation runs (AC-13), disabled while indexing (AC-52),
   and the existing repo Resync in its place when there is no clone (AC-84). */
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { TourActionState } from "../../helpers";

export function TourAction({
  state,
  hasTour,
  onGenerate,
  onResync,
  resyncing,
}: {
  state: TourActionState;
  hasTour: boolean;
  onGenerate: () => void;
  onResync: () => void;
  resyncing: boolean;
}) {
  const t = useTranslations("onboarding.actions");
  if (state === "resync") {
    return (
      <Button icon="RefreshCw" onClick={onResync} loading={resyncing}>
        {t("resync")}
      </Button>
    );
  }
  if (state === "running") {
    return <Button loading>{t("generating")}</Button>;
  }
  return (
    <Button
      kind={hasTour ? "secondary" : "primary"}
      icon={hasTour ? "RefreshCw" : "Sparkles"}
      onClick={onGenerate}
      disabled={state === "blocked"}
    >
      {t(hasTour ? "regenerate" : "generate")}
    </Button>
  );
}
