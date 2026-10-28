"use client";

import React from "react";
import { IntentCard } from "./_components/IntentCard";
import { BlastRadiusCard } from "./_components/BlastRadiusCard";
import { PrBriefBlock } from "./_components/PrBriefBlock";
import { PrDescription } from "./_components/PrDescription";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
  repoId: string;
  repoFullName: string | null;
  headSha: string | null;
  /** Paths of the PR's changed files — a brief jump only opens Files changed for these. */
  changedFiles: string[];
  /** The PR detail's head (refreshed from GitHub) — drives the brief's stale badge. */
  currentHeadSha: string | null;
  /** Open Files changed on a file (and line); pushes a history entry. */
  onOpenInDiff: (path: string, line: number | null) => void;
}

export function OverviewTab({
  prId,
  prBody,
  repoId,
  repoFullName,
  headSha,
  changedFiles,
  currentHeadSha,
  onOpenInDiff,
}: OverviewTabProps) {
  return (
    <>
      {prId && (
        <PrBriefBlock
          prId={prId}
          changedFiles={changedFiles}
          currentHeadSha={currentHeadSha}
          onOpenInDiff={onOpenInDiff}
          intent={<IntentCard prId={prId} />}
          blast={
            <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
          }
        />
      )}
      {prBody && <PrDescription body={prBody} />}
    </>
  );
}
