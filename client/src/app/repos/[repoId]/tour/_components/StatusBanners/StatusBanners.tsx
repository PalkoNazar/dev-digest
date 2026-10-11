/* StatusBanners — the tour's states in words, not colour alone: the last generation
   (kept previous AC-78, failed Q5, interrupted AC-18), indexing / no clone (AC-52, AC-84),
   a skeleton and its reason (AC-46, key link AC-48), a partial index (AC-47), unindexed
   languages (AC-40), removed ungrounded items (AC-58) and a stale tour (AC-55). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Icon, type IconName } from "@devdigest/ui";
import type { OnboardingView } from "@devdigest/shared";
import { shortSha } from "../../helpers";
import { isStale, reasonKey } from "./helpers";
import { s, toneStyle, type Tone } from "./styles";

/** Settings section where LLM keys are added (AC-48). */
const API_KEYS_HREF = "/settings/api-keys";

const TONE_ICON: Record<Tone, IconName> = { info: "Info", warn: "AlertTriangle", error: "AlertOctagon" };

function Banner({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const ToneIcon = Icon[TONE_ICON[tone]];
  return (
    <div style={toneStyle(tone)}>
      <ToneIcon size={16} style={s.icon} aria-hidden="true" />
      <div style={s.text}>{children}</div>
    </div>
  );
}

export function StatusBanners({
  view,
  onRegenerate,
  regenerateDisabled,
}: {
  view: OnboardingView;
  onRegenerate: () => void;
  regenerateDisabled: boolean;
}) {
  const t = useTranslations("onboarding");
  const { tour, generation } = view;
  const bold = (chunks: React.ReactNode) => <strong>{chunks}</strong>;
  const code = (chunks: React.ReactNode) => (
    <code className="mono" style={s.code}>
      {chunks}
    </code>
  );

  const banners: React.ReactNode[] = [];
  if (generation?.status === "done" && generation.outcome === "kept_previous") {
    banners.push(
      <Banner key="kept" tone="error">
        {t("banners.keptPrevious", { reason: t(`reasons.${reasonKey(generation.reason)}`) })}
      </Banner>,
    );
  }
  if (generation?.status === "failed") {
    banners.push(
      <Banner key="failed" tone="error">
        {generation.detail ? t("banners.failedDetail", { detail: generation.detail }) : t("banners.failed")}
      </Banner>,
    );
  }
  if (generation?.status === "interrupted") {
    banners.push(
      <Banner key="interrupted" tone="warn">
        {t("banners.interrupted")}
      </Banner>,
    );
  }
  // A running clone/index job wins over "no clone": the first clone is on its way (AC-52).
  if (view.indexing) {
    banners.push(
      <Banner key="indexing" tone="info">
        {t("state.indexing")}
      </Banner>,
    );
  } else if (!view.clone_ready) {
    banners.push(
      <Banner key="no-clone" tone="warn">
        {t("state.noClone")}
      </Banner>,
    );
  }
  if (tour?.kind === "skeleton") {
    banners.push(
      <Banner key="skeleton" tone="warn">
        <span>{t("banners.skeleton", { reason: t(`reasons.${reasonKey(tour.skeleton_reason)}`) })}</span>
        {tour.skeleton_reason === "no_llm_key" && (
          <>
            {" "}
            <Link href={API_KEYS_HREF} style={s.link}>
              {t("banners.addKey")}
            </Link>
          </>
        )}
        {tour.reason_detail && <div style={s.detail}>{tour.reason_detail}</div>}
      </Banner>,
    );
  }
  if (tour?.index.status === "partial") {
    banners.push(
      <Banner key="partial" tone="info">
        {tour.index.reason
          ? t("banners.partial", { reason: tour.index.reason })
          : t("banners.partialNoReason")}
      </Banner>,
    );
  }
  if (tour && !tour.languages_indexed) {
    banners.push(
      <Banner key="languages" tone="info">
        {t("banners.languages")}
      </Banner>,
    );
  }
  if (tour && tour.removed_ungrounded > 0) {
    banners.push(
      <Banner key="removed" tone="info">
        {t.rich("banners.removed", { count: tour.removed_ungrounded, b: bold })}
      </Banner>,
    );
  }
  if (tour && isStale(view)) {
    banners.push(
      <Banner key="stale" tone="warn">
        <div style={s.staleRow}>
          <span>
            {t.rich("banners.stale", {
              tourSha: shortSha(tour.commit_sha),
              indexSha: shortSha(view.current_commit_sha ?? ""),
              code,
            })}
          </span>
          <Button size="sm" icon="RefreshCw" onClick={onRegenerate} disabled={regenerateDisabled}>
            {t("actions.regenerate")}
          </Button>
        </div>
      </Banner>,
    );
  }

  if (banners.length === 0) return null;
  return <div style={s.stack}>{banners}</div>;
}
