"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import {
  usePrComments,
  useCreatePrComment,
  usePrReviews,
  useSmartDiff,
  useFindingAction,
} from "@/lib/hooks/reviews";
import { countsAsFinding, filesWithFindings, findingsByFile, latestReviewsPerAgent } from "@/lib/smart-diff";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { RoleGroup } from "./_components/RoleGroup";
import { groupFilesByRole } from "./helpers";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** For the finding card's file:line link to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
}

type Order = "smart" | "original";

export function DiffTab({ prId, filesCount, files, canComment, repoFullName, headSha }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: reviews } = usePrReviews(prId);
  const smart = useSmartDiff(prId);
  const action = useFindingAction();
  // null = follow the default: annotations shown when there are active findings.
  const [showOverride, setShowOverride] = React.useState<boolean | null>(null);
  const [order, setOrder] = React.useState<Order>("smart");

  const latest = latestReviewsPerAgent(reviews ?? []);
  const byFile = findingsByFile(latest);
  const findings = latest.flatMap((r) => r.findings);
  const activeFindingCount = findings.filter(countsAsFinding).length;
  const commentCount = comments?.length ?? 0;
  const annotationCount = commentCount + activeFindingCount;
  const show = showOverride ?? activeFindingCount > 0;
  // Smart order needs the server's grouping; fall back while loading / on error.
  const effective: Order = order === "smart" && smart.data ? "smart" : "original";
  const additions = files.reduce((n, f) => n + f.additions, 0);
  const deletions = files.reduce((n, f) => n + f.deletions, 0);

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments: show,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowOverride(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  const findingApi: DiffFindingApi = {
    findings,
    show,
    renderFinding: (f) => (
      <FindingCard
        f={f}
        defaultExpanded
        onAction={(a) => action.mutate({ findingId: f.id, action: a, prId: prId ?? undefined })}
        pending={action.isPending && action.variables?.findingId === f.id}
        repoFullName={repoFullName}
        headSha={headSha}
      />
    ),
    severityLabel: (sev) => t(`smartDiff.severity.${sev}`),
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <span style={s.right}>
            {annotationCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={show ? "EyeOff" : "Eye"}
                onClick={() => setShowOverride(!show)}
              >
                {t(show ? "smartDiff.hideAnnotations" : "smartDiff.showAnnotations", { count: annotationCount })}
              </Button>
            )}
            <span role="group" aria-label={t("smartDiff.orderLabel")} style={s.orderGroup}>
              {(["smart", "original"] as const).map((o) => (
                <Button
                  key={o}
                  kind="tertiary"
                  size="sm"
                  active={order === o}
                  aria-pressed={order === o}
                  onClick={() => setOrder(o)}
                >
                  {t(o === "smart" ? "smartDiff.smartOrder" : "smartDiff.originalOrder")}
                </Button>
              ))}
            </span>
          </span>
        }
      >
        {effective === "smart"
          ? t("smartDiff.reviewerOrdered")
          : t("smartDiff.filesChanged", { count: filesCount })}
        <span className="mono tnum" style={s.stat}>
          <span style={s.addText}>+{additions}</span> <span style={s.delText}>−{deletions}</span>
        </span>
      </SectionLabel>
      {reviews && latest.length === 0 && <div style={s.empty}>{t("smartDiff.noReviewYet")}</div>}
      {effective === "smart" && smart.data ? (
        groupFilesByRole(smart.data.groups, files).map((g) => (
          <RoleGroup
            key={g.role}
            role={g.role}
            files={g.files}
            filesWithFindings={filesWithFindings(
              g.files.map((f) => f.path),
              byFile,
            )}
            commenting={commenting}
            findingApi={findingApi}
          />
        ))
      ) : (
        <DiffViewer files={files} commenting={commenting} findingApi={findingApi} />
      )}
    </section>
  );
}
