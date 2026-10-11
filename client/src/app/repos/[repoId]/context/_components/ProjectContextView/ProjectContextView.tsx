/* ProjectContextView — /repos/:repoId/context (L05). Every Markdown document of the
   repo's default branch (as of the last sync) with its category, a read-only preview,
   a refresh that resyncs the repo and re-lists, and a footer with the count and the
   last sync time. DevDigest only reads the repo: no edit, upload or create. */
"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useContextDocs, useInvalidateRepoDocs } from "@/lib/hooks/context";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { DocPreview } from "./_components/DocPreview";
import { middleEllipsisPath } from "@/lib/path-ellipsis";
import { lastSyncDate } from "./helpers";
import { useDocsRefresh } from "./useDocsRefresh";
import { s } from "./styles";

export function ProjectContextView({ repoId }: { repoId: string }) {
  const t = useTranslations("context");
  const format = useFormatter();
  const { repos } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: docs, isLoading, isError, refetch } = useContextDocs(repoId);
  // A finished resync re-reads the list and the open preview (it may have changed).
  const onRefreshed = useInvalidateRepoDocs(repoId);
  const refresh = useDocsRefresh(repoId, onRefreshed);
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);

  const repoName = repos.find((r) => r.id === repoId)?.full_name;
  const crumb = [...(repoName ? [{ label: repoName }] : []), { label: t("title") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const list = docs ?? [];
  // Keep the selection while it is still listed; otherwise preview the first document.
  const selected = list.find((d) => d.path === selectedPath) ?? list[0] ?? null;
  const synced = lastSyncDate(refresh.updatedAt);

  let side: React.ReactNode;
  if (isLoading) {
    side = (
      <div style={s.sideState} aria-busy="true">
        <Skeleton height={14} />
        <Skeleton height={14} style={{ marginTop: 8 }} />
        <Skeleton height={14} style={{ marginTop: 8 }} />
      </div>
    );
  } else if (isError) {
    side = (
      <div style={s.sideState}>
        <ErrorState title={t("loadError")} body={t("loadErrorBody")} onRetry={() => refetch()} />
      </div>
    );
  } else {
    side = (
      <div style={s.list}>
        {list.map((d) => (
          <button
            key={d.path}
            type="button"
            title={d.path}
            aria-current={d.path === selected?.path ? "true" : undefined}
            onClick={() => setSelectedPath(d.path)}
            style={s.item(d.path === selected?.path)}
          >
            <Icon.FileText size={13} />
            <span className="mono" style={s.itemPath}>
              <ShortPath path={d.path} />
            </span>
            <Badge>{d.category}</Badge>
          </button>
        ))}
      </div>
    );
  }

  let main: React.ReactNode = null;
  if (!isLoading && !isError) {
    main = selected ? (
      <DocPreview key={selected.path} repoId={repoId} doc={selected} />
    ) : (
      <div style={s.center}>
        <EmptyState icon="FileText" title={t("empty.title")} body={t("empty.body")} />
      </div>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <aside style={s.side}>
          <div style={s.sideHead}>
            <div style={s.sideTitleRow}>
              <span style={s.sideTitle}>{t("title")}</span>
              <Button
                kind="ghost"
                size="sm"
                icon="RefreshCw"
                loading={refresh.busy}
                disabled={refresh.busy || !refresh.ready}
                onClick={refresh.start}
                title={t("refresh")}
                aria-label={t("refresh")}
              />
            </div>
            <span style={s.sideSub}>{t("subtitle")}</span>
          </div>
          {refresh.timedOut && (
            <span role="status" style={s.status}>
              {t("refreshTimeout")}
            </span>
          )}
          {side}
          <div style={s.footer}>
            {t.rich("footer", {
              count: list.length,
              when: synced ? format.relativeTime(synced) : t("never"),
              b: (c) => <strong>{c}</strong>,
            })}
          </div>
        </aside>
        <main style={s.main}>{main}</main>
      </div>
    </AppShell>
  );
}

/** Characters of a list-row path before it is shortened in the middle (300 px side pane). */
const LIST_PATH_MAX = 30;

/** The path cut in the middle for the eye; the full path stays the accessible text (AC-43). */
function ShortPath({ path }: { path: string }) {
  const short = middleEllipsisPath(path, LIST_PATH_MAX);
  if (short === path) return <>{path}</>;
  return (
    <>
      <span aria-hidden="true">{short}</span>
      <span style={s.srOnly}>{path}</span>
    </>
  );
}
