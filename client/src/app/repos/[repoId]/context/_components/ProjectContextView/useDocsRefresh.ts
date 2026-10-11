/* useDocsRefresh — the page's refresh action (AC-9): resync the repo (POST /repos/:id/resync),
   poll the index state until a new row lands, then re-list the documents. Same flow as
   BlastRadiusCard's Resync; gives up after RESYNC_TIMEOUT_MS (the job may never write a row). */
"use client";

import React from "react";
import { useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { RESYNC_TIMEOUT_MS, resyncFinished } from "@/lib/repo-resync";

export function useDocsRefresh(repoId: string, onDone: () => void) {
  // `from` = the index state's updatedAt when Refresh was clicked; Refresh stays disabled
  // until that baseline is known, so a fast resync can't be mistaken for the baseline.
  const [resync, setResync] = React.useState<{ from: string } | null>(null);
  const [timedOut, setTimedOut] = React.useState(false);
  const { data: indexState } = useRepoIntelStatus(repoId, resync !== null);
  const resyncMut = useResyncRepoIntel(repoId);

  const waiting = resync !== null;
  React.useEffect(() => {
    if (!waiting) return;
    const id = setTimeout(() => {
      setResync(null);
      setTimedOut(true);
    }, RESYNC_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [waiting]);

  // The resync runs as a server job: watch the polled index state (an external system).
  React.useEffect(() => {
    if (!resync) return;
    if (resyncFinished(resync.from, indexState)) {
      setResync(null);
      onDone();
    }
  }, [resync, indexState, onDone]);

  const start = () => {
    if (!indexState) return;
    setTimedOut(false);
    setResync({ from: indexState.updatedAt });
    // Errors are toasted by the global MutationCache handler (lib/providers.tsx).
    resyncMut.mutate(undefined, { onError: () => setResync(null) });
  };

  return {
    start,
    busy: resync !== null || resyncMut.isPending,
    ready: !!indexState,
    timedOut,
    updatedAt: indexState?.updatedAt,
  };
}
