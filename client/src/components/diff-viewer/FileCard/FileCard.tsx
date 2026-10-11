/* FileCard — one collapsible file in the diff: header (path, findings dot,
   +/- stat, comment count) and, when open, its parsed lines plus any findings
   off the patch and any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { countsAsFinding } from "@/lib/smart-diff";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { fs, partitionFindings, topSeverity, type DiffFindingApi } from "../findings";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { UnmatchedFindings } from "../UnmatchedFindings";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** Findings anchored to a given parsed line (findings key on the new side). */
function findingsForLine(ln: Line, matched: Map<string, FindingRecord[]>): FindingRecord[] {
  if (matched.size === 0) return [];
  const out: FindingRecord[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  findingApi,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findingApi?: DiffFindingApi;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const renderedKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) keys.add(k);
    return keys;
  }, [lines]);
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, renderedKeys]);

  // This file's review findings: anchored to a rendered line, or off the patch.
  const allFindings = findingApi?.findings;
  const { fileFindings, matchedFindings, unmatchedFindings } = React.useMemo(() => {
    const own = (allFindings ?? []).filter((f) => f.file === file.path);
    const { matched: m, unmatched } = partitionFindings(own, renderedKeys);
    return { fileFindings: own, matchedFindings: m, unmatchedFindings: unmatched };
  }, [allFindings, file.path, renderedKeys]);
  // The dot marks files with a counted (non-dismissed) finding, even when hidden.
  const dotSeverity = fileFindings.some(countsAsFinding) ? topSeverity(fileFindings) : null;
  const showFindings = !!findingApi?.show;

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span style={s.filePathWrap}>
          <span className="mono" style={s.filePath}>
            {file.path}
          </span>
          {dotSeverity && (
            <span
              role="img"
              aria-label={t("diffViewer.fileHasFindings")}
              title={t("diffViewer.fileHasFindings")}
              style={fs.dot(SEV[dotSeverity].c)}
            />
          )}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                findings={findingsForLine(ln, matchedFindings)}
                findingApi={findingApi}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {findingApi && showFindings && (
            <UnmatchedFindings findings={unmatchedFindings} findingApi={findingApi} />
          )}
        </div>
      )}
    </div>
  );
}
