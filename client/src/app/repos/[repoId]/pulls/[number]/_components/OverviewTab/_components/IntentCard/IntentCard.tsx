/* IntentCard — the PR's derived intent on the Overview tab: summary, in/out of
   scope, evidence-based confidence, missing context, sources, model and cost.
   Polls while a review run is active and the intent is missing or stale. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
import { useDeriveIntent, usePrIntent } from "@/lib/hooks/intent";
import { usePrActiveRuns } from "@/lib/hooks/reviews";
import { formatUsd } from "@/components/run-cost-badge";
import { INTENT_CONFIDENCE_TONE } from "../../../../constants";
import { lacksDescription, modelLabel, showsRef, totalEstTokens } from "./helpers";
import { s } from "./styles";

export function IntentCard({ prId }: { prId: string }) {
  const t = useTranslations("brief");
  const { data: activeRuns } = usePrActiveRuns(prId);
  const runActive = (activeRuns?.length ?? 0) > 0;
  const { data, isLoading, isError, refetch } = usePrIntent(prId, { poll: runActive });
  const derive = useDeriveIntent(prId);
  const intent = data?.intent ?? null;

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div style={s.skeleton} data-testid="intent-skeleton">
        <Skeleton width="60%" height={16} />
        <Skeleton height={12} />
        <Skeleton width="80%" height={12} />
      </div>
    );
  } else if (isError) {
    body = <ErrorState title={t("intentCard.loadError")} onRetry={() => void refetch()} />;
  } else if (!intent) {
    body = (
      <EmptyState
        icon="Target"
        title={derive.isPending || runActive ? t("intentCard.deriving") : t("intentCard.empty")}
        body={t("intentCard.emptyHint")}
        // A run is already deriving the intent: a forced POST now would pay twice
        // and race the same pr_intent row.
        cta={runActive ? undefined : t("intentCard.derive")}
        onCta={runActive ? undefined : () => derive.mutate()}
        ctaLoading={derive.isPending}
      />
    );
  } else {
    body = <IntentDetails intent={intent} />;
  }

  return (
    <section style={s.section}>
      <SectionLabel
        icon="Target"
        right={
          intent && (
            <div style={s.headerRight}>
              <Badge {...INTENT_CONFIDENCE_TONE[intent.confidence]}>
                {t(`intentCard.confidence.${intent.confidence}`)}
              </Badge>
              {intent.mode === "fallback" && (
                <>
                  <Badge icon="AlertTriangle">{t("intentCard.fallback")}</Badge>
                  {intent.fallback_reason && (
                    <span style={s.fallbackReason} title={intent.fallback_reason}>
                      {intent.fallback_reason}
                    </span>
                  )}
                </>
              )}
              {data?.stale && (
                <Badge color="var(--warn)" bg="var(--warn-bg)" icon="GitCommit">
                  {t("intentCard.stale")}
                </Badge>
              )}
              <Button
                kind="ghost"
                size="sm"
                icon="RefreshCw"
                loading={derive.isPending}
                disabled={runActive}
                onClick={() => derive.mutate()}
              >
                {derive.isPending ? t("intentCard.deriving") : t("intentCard.recompute")}
              </Button>
            </div>
          )
        }
      >
        {t("block.intent")}
      </SectionLabel>
      {body}
    </section>
  );
}

function IntentDetails({ intent }: { intent: PrIntentRecord }) {
  const t = useTranslations("brief");
  const model = modelLabel(intent);
  const sources = intent.sources_used
    .map((src) => {
      const kind = t(`intentCard.sourceKind.${src.kind}`);
      return showsRef(src) ? `${kind} ${src.ref}` : kind;
    })
    .join(" · ");

  return (
    <div style={s.card}>
      <blockquote style={s.summary}>{intent.summary}</blockquote>

      <div style={s.columns}>
        <ScopeColumn title={t("intentCard.inScope")} items={intent.in_scope} icon="Check" color="var(--ok)" />
        <ScopeColumn title={t("intentCard.outOfScope")} items={intent.out_of_scope} icon="X" color="var(--crit)" />
      </div>

      {intent.missing_context && <ContextMissing intent={intent} />}
      {intent.context_gaps.length > 0 && <ModelNotes notes={intent.context_gaps} />}

      <div style={s.footer}>
        <span>
          <span style={s.footerLabel}>{t("intentCard.sources")}</span>
          {sources}
        </span>
        {model && (
          <span>
            <span style={s.footerLabel}>{t("intentCard.model")}</span>
            <span className="mono">{model}</span>
          </span>
        )}
        <span>{t("intentCard.tokEst", { count: totalEstTokens(intent.prompt_components) })}</span>
        <span>
          <span style={s.footerLabel}>{t("intentCard.cost")}</span>
          {formatUsd(intent.cost_usd)}
        </span>
      </div>
    </div>
  );
}

function ScopeColumn({
  title,
  items,
  icon,
  color,
}: {
  title: string;
  items: string[];
  icon: "Check" | "X";
  color: string;
}) {
  const I = Icon[icon];
  return (
    <div>
      <div style={s.columnTitle}>{title}</div>
      <ul style={s.list}>
        {items.map((item) => (
          <li key={item} style={s.item}>
            <I size={14} style={s.itemIcon(color)} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContextMissing({ intent }: { intent: PrIntentRecord }) {
  const t = useTranslations("brief");
  return (
    <div style={s.notice} role="note">
      <div style={s.noticeTitle}>
        <Icon.AlertTriangle size={14} />
        {t("intentCard.contextMissing")}
      </div>
      <span>{t("intentCard.contextMissingHint")}</span>
      <ul style={s.noticeList}>
        {lacksDescription(intent) && <li>{t("intentCard.noDescription")}</li>}
        {intent.unresolved_refs.map((ref) => (
          <li key={`${ref.kind}:${ref.ref}`}>
            <span className="mono">{ref.ref}</span> — {t(`intentCard.reason.${ref.reason}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The classifier's own caveats — informational, never the "context missing" alarm. */
function ModelNotes({ notes }: { notes: string[] }) {
  const t = useTranslations("brief");
  return (
    <div style={s.notes}>
      <div style={s.notesTitle}>
        <Icon.Info size={13} />
        {t("intentCard.modelNotes")}
      </div>
      <ul style={s.noticeList}>
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}
