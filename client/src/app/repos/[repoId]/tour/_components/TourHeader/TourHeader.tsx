/* TourHeader — "Onboarding for <repo>", and for a stored tour: the index size it was built
   from, the short commit SHA and when it was generated (AC-11); "N of M source files
   indexed" when the index left files out (AC-53). No model, cost or Share link (EC-25). */
"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { OnboardingTour } from "@devdigest/shared";
import { shortSha } from "../../helpers";
import { s } from "./styles";

export function TourHeader({
  repoName,
  tour,
  action,
}: {
  repoName: string;
  tour: OnboardingTour | null;
  /** The Generate / Regenerate / Resync control, when the header carries one. */
  action?: React.ReactNode;
}) {
  const t = useTranslations("onboarding");
  const format = useFormatter();
  const bold = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

  return (
    <header style={s.header}>
      <div style={s.text}>
        <h1 style={s.title}>
          {t.rich("page.title", { name: repoName, repo: (c) => <span style={s.repo}>{c}</span> })}
        </h1>
        {tour && (
          <p style={s.meta}>
            {t.rich("header.meta", {
              count: tour.index.files_indexed,
              sha: shortSha(tour.commit_sha),
              when: format.relativeTime(new Date(tour.generated_at)),
              b: bold,
            })}
          </p>
        )}
        {tour && tour.index.files_indexed < tour.index.files_total && (
          <p style={s.meta}>
            {t.rich("header.partialCount", {
              indexed: format.number(tour.index.files_indexed),
              total: format.number(tour.index.files_total),
              b: bold,
            })}
          </p>
        )}
      </div>
      {action && <div style={s.actions}>{action}</div>}
    </header>
  );
}
