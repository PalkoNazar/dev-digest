/* PrBriefBlock — the PR Why + Risk Brief on Overview (L05): Generate / Regenerate,
   verdict banner (latest completed review) + summary, meta line, input notices,
   left column intent slot + Risk areas, right column blast slot, full-width Review focus.
   A stale brief only shows a badge; generation happens on a click only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, SectionLabel, Skeleton } from "@devdigest/ui";
import type { PrBrief } from "@devdigest/shared";
import { useBriefGeneration, usePrBrief } from "@/lib/hooks/brief";
import { usePrReviews, usePrRuns } from "@/lib/hooks/reviews";
import { formatUsd } from "@/components/run-cost-badge";
import { VerdictBanner } from "../../../VerdictBanner";
import { RiskAreas } from "./_components/RiskAreas";
import { ReviewFocus } from "./_components/ReviewFocus";
import { isBriefStale, latestCompletedReview, noticeKeys, shortSha } from "./helpers";
import { s } from "./styles";

interface PrBriefBlockProps {
  prId: string;
  changedFiles: readonly string[];
  currentHeadSha: string | null;
  onOpenInDiff: (path: string, line: number | null) => void;
  /** The existing Intent card (left column). */
  intent: React.ReactNode;
  /** The existing Blast radius card (right column). */
  blast: React.ReactNode;
}

export function PrBriefBlock({
  prId,
  changedFiles,
  currentHeadSha,
  onOpenInDiff,
  intent,
  blast,
}: PrBriefBlockProps) {
  const t = useTranslations("brief");
  const { data, isLoading, isError, refetch } = usePrBrief(prId);
  const { generate, isPending, error } = useBriefGeneration(prId);
  const { data: reviews } = usePrReviews(prId);
  const { data: runs } = usePrRuns(prId);
  const brief = data?.brief ?? null;
  const stale = isBriefStale(data, currentHeadSha);
  const banner = latestCompletedReview(reviews, runs);
  const busy = isPending || isLoading;
  const skeleton = <BriefSkeleton />;

  let top: React.ReactNode;
  if (isLoading || isPending) top = <BriefSkeleton label={t(isPending ? "generating" : "loading")} />;
  else if (isError && !data) {
    // A failed read is not "no brief yet": offer a re-read, never a generation.
    top = (
      <div role="alert" style={s.error}>
        <span style={s.errorText}>{t("loadError")}</span>
        <Button kind="ghost" size="sm" onClick={() => void refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  } else if (!brief) {
    top = (
      <div style={s.empty}>
        <span style={s.emptyTitle}>{t("unavailable")}</span>
        <p style={s.emptyHint}>{t("unavailableHint")}</p>
        <Button kind="primary" size="sm" icon="Sparkles" disabled={busy} onClick={generate}>
          {t("generate")}
        </Button>
      </div>
    );
  } else {
    top = (
      <div style={s.card}>
        {banner ? (
          <VerdictBanner
            verdict={banner.verdict}
            summary={brief.summary}
            score={banner.score}
            findingsCount={banner.findingsCount}
            blockers={banner.blockers}
            agentName={banner.agentName}
          />
        ) : (
          <p style={s.summary}>{brief.summary}</p>
        )}
        <BriefMeta brief={brief} />
        <BriefNotices brief={brief} />
      </div>
    );
  }

  return (
    <section style={s.root}>
      <SectionLabel
        icon="FileText"
        right={
          brief && (
            <span style={s.headerRight}>
              {stale && (
                <Badge color="var(--warn)" bg="var(--warn-bg)" icon="GitCommit">
                  {t("stale")}
                </Badge>
              )}
              <Button
                kind="ghost"
                size="sm"
                icon="RefreshCw"
                aria-label={t("regenerate")}
                title={t("regenerate")}
                disabled={busy}
                loading={isPending}
                onClick={generate}
              />
            </span>
          )
        }
      >
        {t("block.brief")}
      </SectionLabel>
      {error != null && !isPending && (
        <div role="alert" style={s.error}>
          <span style={s.errorText}>
            <span style={s.errorTitle}>{t("error.title")}</span>
            {error instanceof Error ? error.message : null}
          </span>
          <Button kind="ghost" size="sm" disabled={busy} onClick={generate}>
            {t("retry")}
          </Button>
        </div>
      )}
      {top}
      <div style={s.columns}>
        <div style={s.column}>
          {intent}
          {isPending ? (
            skeleton
          ) : (
            brief && (
              <RiskAreas risks={brief.risks.risks} changedFiles={changedFiles} onOpenInDiff={onOpenInDiff} />
            )
          )}
        </div>
        <div style={s.column}>{blast}</div>
      </div>
      {isPending
        ? skeleton
        : brief && (
            <ReviewFocus items={brief.review_focus} changedFiles={changedFiles} onOpenInDiff={onOpenInDiff} />
          )}
    </section>
  );
}

/** Placeholder while loading / generating; only the one with a `label` is announced. */
function BriefSkeleton({ label }: { label?: string }) {
  return (
    <div
      style={s.skeleton}
      role={label ? "status" : undefined}
      aria-busy="true"
      aria-label={label}
      data-testid="brief-skeleton"
    >
      <Skeleton width="60%" height={16} />
      <Skeleton height={12} />
      <Skeleton width="80%" height={12} />
    </div>
  );
}

/** Model, tokens in→out, cost, time and short head SHA of the call that made the brief. */
function BriefMeta({ brief }: { brief: PrBrief }) {
  const t = useTranslations("brief");
  const { run } = brief;
  return (
    <div className="mono" style={s.meta}>
      <span>{t("meta.model", { model: run.model })}</span>
      <span>{t("meta.tokens", { in: run.tokens_in, out: run.tokens_out })}</span>
      <span>{t("meta.cost", { cost: formatUsd(run.cost_usd) })}</span>
      <span>{t("meta.time", { seconds: (run.duration_ms / 1000).toFixed(1) })}</span>
      <span title={run.head_sha}>{t("meta.sha", { sha: shortSha(run.head_sha) })}</span>
    </div>
  );
}

/** Missing / cut inputs and how many items grounding removed. */
function BriefNotices({ brief }: { brief: PrBrief }) {
  const t = useTranslations("brief");
  const notes = noticeKeys(brief.inputs);
  const { risks, review_focus } = brief.removed;
  return (
    <>
      {notes.length > 0 && (
        <div style={s.notices}>
          <div style={s.noticesTitle}>{t("notice.title")}</div>
          <ul style={s.noticeList}>
            {notes.map((n) => (
              <li key={`${n.input}|${n.reason}|${n.ref ?? ""}`}>
                {n.ref
                  ? t("notice.itemRef", { input: t(n.input), ref: n.ref, reason: t(n.reason) })
                  : t("notice.item", { input: t(n.input), reason: t(n.reason) })}
              </li>
            ))}
          </ul>
        </div>
      )}
      {risks + review_focus > 0 && (
        <div style={s.removed}>{t("removed", { risks, focus: review_focus })}</div>
      )}
    </>
  );
}
