/* BlastRadiusCard — the PR's blast radius on the Overview tab: summary counts, then
   per changed symbol its callers and the endpoints/crons that may break. Built by the
   server from the repo-intel index; a degraded index shows its reason + Resync, and
   the map is re-read once the resync has written a new index state. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import type { BlastRadius, BlastStats } from "@devdigest/shared";
import { usePrBlast } from "@/lib/hooks/blast";
import { useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { BlastSymbolImpact } from "../BlastSymbolImpact";
import { STAT_ICONS, STAT_KEYS } from "./constants";
import { linkSha, resyncFinished, symbolLabel } from "./helpers";
import { s } from "./styles";

interface BlastRadiusCardProps {
  prId: string;
  repoId: string;
  repoFullName: string | null;
  headSha: string | null;
}

export function BlastRadiusCard({ prId, repoId, repoFullName, headSha }: BlastRadiusCardProps) {
  const t = useTranslations("blast");
  const { data, isLoading, isError, refetch } = usePrBlast(prId);

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div style={s.skeleton} data-testid="blast-skeleton">
        <Skeleton width="50%" height={14} />
        <Skeleton height={12} />
        <Skeleton width="70%" height={12} />
      </div>
    );
  } else if (isError || !data) {
    body = <ErrorState title={t("loadError")} onRetry={() => void refetch()} />;
  } else {
    body = (
      <BlastBody
        blast={data}
        repoId={repoId}
        repoFullName={repoFullName}
        headSha={headSha}
        onIndexUpdated={refetch}
      />
    );
  }

  return (
    <section style={s.section}>
      <SectionLabel icon="Zap">{t("title")}</SectionLabel>
      {body}
    </section>
  );
}

function BlastBody({
  blast,
  repoId,
  repoFullName,
  headSha,
  onIndexUpdated,
}: {
  blast: BlastRadius;
  repoId: string;
  repoFullName: string | null;
  headSha: string | null;
  onIndexUpdated: () => void;
}) {
  const t = useTranslations("blast");
  const sha = linkSha(blast, headSha);

  if (blast.downstream.length === 0 && !blast.degraded) {
    const count = blast.changed_symbols.length;
    return (
      <EmptyState
        icon="Zap"
        title={count === 0 ? t("noChangedSymbols") : t("noDownstream", { count })}
      />
    );
  }

  return (
    <div style={s.card}>
      {blast.degraded && (
        <DegradedNotice repoId={repoId} reason={blast.reason} onIndexUpdated={onIndexUpdated} />
      )}
      {blast.stats && <StatsRow stats={blast.stats} />}
      {blast.downstream.length > 0 && (
        <div>
          {blast.downstream.map((impact, i) => (
            <BlastSymbolImpact
              key={impact.symbol}
              impact={impact}
              label={symbolLabel(impact.symbol, blast.changed_symbols)}
              linkSha={sha}
              repoFullName={repoFullName}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatsRow({ stats }: { stats: BlastStats }) {
  const t = useTranslations("blast");
  return (
    <div style={s.stats} data-testid="blast-stats">
      {STAT_KEYS.map((key, i) => {
        const I = STAT_ICONS[key];
        return (
          <React.Fragment key={key}>
            {i > 0 && (
              <span style={s.statSep} aria-hidden>
                ·
              </span>
            )}
            <span style={s.stat}>
              <I size={13} style={s.statIcon} />
              <span>
                {t.rich(`stat.${key}`, {
                  count: stats[key],
                  b: (chunks) => <strong style={s.statValue}>{chunks}</strong>,
                })}
              </span>
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/** Warn badge + reason + Resync; polls the index state until the resync wrote a new row. */
function DegradedNotice({
  repoId,
  reason,
  onIndexUpdated,
}: {
  repoId: string;
  reason: BlastRadius["reason"];
  onIndexUpdated: () => void;
}) {
  const t = useTranslations("blast");
  // `from` = the index state's updatedAt when Resync was clicked; null = clicked before
  // the first state arrived, so the next state seen becomes the baseline.
  const [resync, setResync] = React.useState<{ from: string | null } | null>(null);
  const { data: indexState } = useRepoIntelStatus(repoId, resync !== null);
  const resyncMut = useResyncRepoIntel(repoId);

  // The resync runs as a server job: watch the polled index state (an external
  // system) and re-read the blast map once a new index row has landed.
  React.useEffect(() => {
    if (!resync) return;
    if (resync.from === null) {
      if (indexState) setResync({ from: indexState.updatedAt });
      return;
    }
    if (resyncFinished(resync.from, indexState)) {
      setResync(null);
      onIndexUpdated();
    }
  }, [resync, indexState, onIndexUpdated]);

  const startResync = () => {
    setResync({ from: indexState?.updatedAt ?? null });
    // Errors are toasted by the global MutationCache handler (lib/providers.tsx).
    resyncMut.mutate(undefined, { onError: () => setResync(null) });
  };
  const busy = resync !== null || resyncMut.isPending;

  return (
    <div style={s.notice} role="note">
      <div style={s.noticeHead}>
        <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
          {t("degraded.badge")}
        </Badge>
        <Button kind="ghost" size="sm" icon="RefreshCw" loading={busy} disabled={busy} onClick={startResync}>
          {busy ? t("resyncing") : t("resync")}
        </Button>
      </div>
      <span>{t(`degraded.reason.${reason ?? "no_data"}`)}</span>
    </div>
  );
}
