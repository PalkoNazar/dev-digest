/* UnmatchedFindings — footer for review findings whose line is not part of this
   file's patch (so nothing the reviewer said is silently dropped). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { cs } from "../comments";
import type { DiffFindingApi } from "../findings";

export function UnmatchedFindings({
  findings,
  findingApi,
}: {
  findings: FindingRecord[];
  findingApi: DiffFindingApi;
}) {
  const t = useTranslations("shell");
  if (findings.length === 0) return null;
  return (
    <div style={cs.outdatedWrap}>
      <span style={cs.outdatedTitle}>
        {t("diffViewer.unmatchedFindingsTitle", { count: findings.length })}
      </span>
      {findings.map((f) => (
        <React.Fragment key={f.id}>{findingApi.renderFinding(f)}</React.Fragment>
      ))}
    </div>
  );
}
