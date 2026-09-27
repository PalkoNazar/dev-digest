/* FindingsCell — PR list FINDINGS column: per-severity counts of the latest
   review; hovering or focusing them opens a card listing that review's
   findings (fetched lazily, only on first open). */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Icon,
  SEV,
  SeverityBadge,
  CategoryTag,
  ConfidenceNum,
  Skeleton,
  type Category,
} from "@devdigest/ui";
import type { SeverityCounts } from "@devdigest/shared";
import { usePrReviews } from "@/lib/hooks/reviews";
import { sortBySeverity } from "@/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/helpers";
import { lineLabel } from "@/app/repos/[repoId]/pulls/[number]/_components/FindingCard/helpers";
import { CLOSE_DELAY_MS, LEVELS } from "./constants";
import { cardPosition, findingHref, latestReview, totalFindings } from "./helpers";
import { s } from "./styles";

export function FindingsCell({
  prId,
  prHref,
  counts,
}: {
  prId: string | null | undefined;
  /** PR detail route — each finding links to `?tab=findings&finding=<id>` there. */
  prHref: string;
  counts: SeverityCounts | null | undefined;
}) {
  const t = useTranslations("prReview");
  const anchor = React.useRef<HTMLDivElement>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const [pos, setPos] = React.useState<ReturnType<typeof cardPosition> | null>(null);
  const cardId = React.useId();

  const total = counts ? totalFindings(counts) : 0;

  React.useEffect(() => () => clearTimeout(closeTimer.current), []);
  // Counts can drop to none while the card is open (refetch after a clean
  // re-review): the card unmounts without a mouseleave, so reset `pos` here —
  // else the card pops up unprompted once findings come back.
  React.useEffect(() => {
    if (total > 0) return;
    clearTimeout(closeTimer.current);
    setPos(null);
  }, [total]);

  if (!counts) return <span style={s.muted}>—</span>;
  if (total === 0) return <span style={s.muted}>0</span>;

  const open = () => {
    clearTimeout(closeTimer.current);
    const r = anchor.current?.getBoundingClientRect();
    if (r) setPos(cardPosition(r, { width: window.innerWidth, height: window.innerHeight }));
  };
  const close = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPos(null), CLOSE_DELAY_MS);
  };
  const dismiss = () => {
    clearTimeout(closeTimer.current);
    setPos(null);
  };
  // Keyboard: Tab focus opens (onFocus), Enter/Space toggles, Escape dismisses.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") dismiss();
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault(); // Space would scroll the page
      if (pos) dismiss();
      else open();
    }
  };

  return (
    <div
      ref={anchor}
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-expanded={!!pos}
      aria-controls={pos ? cardId : undefined}
      aria-label={t("list.findings.title", { count: total })}
      style={s.trigger}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
      onKeyDown={onKeyDown}
    >
      {LEVELS.filter((l) => counts[l.key] > 0).map(({ sev, key }) => {
        const I = Icon[SEV[sev].icon];
        return (
          <span key={sev} style={s.count(SEV[sev].c)} title={t(`panel.severity.${sev}`)}>
            <I size={14} />
            {counts[key]}
          </span>
        );
      })}
      {pos &&
        createPortal(
          <div
            id={cardId}
            role="dialog"
            aria-label={t("list.findings.title", { count: total })}
            style={s.card(pos)}
            // Portal events still bubble to PRRow's onClick — a click in the card
            // goes only where the finding's own link points, not to the PR root.
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={open}
            onMouseLeave={close}
          >
            <div style={s.cardHeader}>{t("list.findings.title", { count: total })}</div>
            <FindingsList prId={prId} prHref={prHref} />
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Body of the hover card — mounts on first hover, so the fetch is lazy. */
function FindingsList({ prId, prHref }: { prId: string | null | undefined; prHref: string }) {
  const t = useTranslations("prReview");
  const { data, isLoading, isError } = usePrReviews(prId);

  if (isLoading) {
    return (
      <div style={s.cardBody}>
        <Skeleton height={48} />
        <Skeleton height={48} />
      </div>
    );
  }
  if (isError) return <div style={{ ...s.cardBody, ...s.cardNote }}>{t("list.findings.error")}</div>;

  const findings = sortBySeverity(latestReview(data ?? [])?.findings ?? []);
  if (findings.length === 0) {
    return <div style={{ ...s.cardBody, ...s.cardNote }}>{t("list.findings.empty")}</div>;
  }
  return (
    <div style={s.cardBody}>
      {findings.map((f) => (
        <Link
          key={f.id}
          href={findingHref(prHref, f.id)}
          style={s.item(SEV[f.severity].c)}
        >
          <div style={s.itemTitleRow}>
            <SeverityBadge severity={f.severity} compact />
            <span style={s.itemTitle}>{f.title}</span>
          </div>
          <div style={s.itemMeta}>
            <CategoryTag category={f.category as Category} />
            <span className="mono" style={s.itemFile}>
              {f.file}:{lineLabel(f)}
            </span>
            <ConfidenceNum value={f.confidence} />
          </div>
          <div style={s.itemRationale}>{f.rationale}</div>
        </Link>
      ))}
    </div>
  );
}
