/* ScanHeader — "Conventions in <repo>", what the last scan looked at, Re-scan,
   and the scan's state: running, failed (with the reason) or what was dropped. */
"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { ConventionScan } from "@devdigest/shared";
import { droppedEntries } from "./helpers";
import { s } from "./styles";

export function ScanHeader({
  repoName,
  scan,
  running,
  onScan,
}: {
  repoName: string;
  scan: ConventionScan | null;
  running: boolean;
  onScan: () => void;
}) {
  const t = useTranslations("conventions");
  const format = useFormatter();
  const dropped = scan ? droppedEntries(scan.dropped) : [];

  return (
    <header style={s.wrap}>
      <div style={s.titleRow}>
        <div style={s.titles}>
          <h1 style={s.h1}>
            {t("page.headingPrefix")}
            <span className="mono" style={s.repo}>
              {repoName.slice(repoName.lastIndexOf("/") + 1)}
            </span>
          </h1>
          <p style={s.sub}>
            {scan?.status === "done" && scan.finished_at
              ? t("page.meta", {
                  count: scan.sample_paths.length,
                  when: format.relativeTime(new Date(scan.finished_at)),
                }) + (scan.cost_usd != null ? t("page.metaCost", { cost: `$${scan.cost_usd.toFixed(4)}` }) : "")
              : t("page.subtitle")}
          </p>
        </div>
        {scan && (
          <Button kind="secondary" icon="RefreshCw" onClick={onScan} loading={running} disabled={running}>
            {running ? t("page.scanning") : t("page.rescan")}
          </Button>
        )}
      </div>

      {running && (
        <div style={s.info} role="status">
          <Icon.RefreshCw size={14} /> {t("page.scanRunning")}
        </div>
      )}
      {!running && scan?.status === "failed" && (
        <div style={s.error} role="alert">
          <Icon.AlertTriangle size={14} />
          <span>
            <strong>{t("page.extractionFailed")}</strong>
            {scan.error ? ` — ${scan.error}` : ""}
          </span>
        </div>
      )}
      {!running && scan?.status === "done" && (
        <div style={s.stats}>
          <span>{t("page.dropped", { kept: scan.kept, proposed: scan.proposed })}</span>
          {dropped.map(([reason, count]) => (
            <span key={reason} style={s.stat}>
              {t("page.droppedReason", { reason: t(`dropReason.${reason}`), count })}
            </span>
          ))}
          {scan.tooling.length > 0 && (
            <span style={s.stat}>{t("page.tooling", { list: scan.tooling.join(", ") })}</span>
          )}
        </div>
      )}
    </header>
  );
}
