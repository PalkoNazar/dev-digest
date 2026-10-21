/* FileCard — one collapsible file in the diff: header (path, findings dot,
   +/- stat, comment count) and, when open, its parsed lines plus any findings
   off the patch and any outdated comments. With a `focus` on its path it is the
   single scroll owner: it forces itself open, highlights the line and scrolls once. */
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
import { focusKeyOf, focusLineIndex, type DiffFocus } from "../focus";
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
  focus,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findingApi?: DiffFindingApi;
  /** Jump target; acts only when `focus.path` is this file. */
  focus?: DiffFocus | null;
}) {
  const t = useTranslations("shell");
  const focusKey = focus?.path === file.path ? focusKeyOf(focus) : null;
  const [open, setOpen] = React.useState(
    focusKey !== null || (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  // A new focus on this file forces it open (over AUTO_EXPAND_MAX_LINES); the user can
  // still collapse it afterwards. Adjusted during render, not in an effect.
  const [openedFor, setOpenedFor] = React.useState(focusKey);
  if (focusKey !== openedFor) {
    setOpenedFor(focusKey);
    if (focusKey !== null) setOpen(true);
  }
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);
  const focusLine = focusKey !== null ? (focus?.line ?? null) : null;
  const focusIdx = focusLineIndex(lines, focusLine);
  const lineMissing = focusLine !== null && focusIdx < 0;

  // Single scroll owner: once per focus key, after the open body has rendered.
  const cardRef = React.useRef<HTMLDivElement>(null);
  const scrolledFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (focusKey === null || !open || scrolledFor.current === focusKey) return;
    const frame = requestAnimationFrame(() => {
      scrolledFor.current = focusKey;
      const card = cardRef.current;
      const row = focusIdx >= 0 ? card?.querySelector("[data-focus-line]") : null;
      if (row) row.scrollIntoView({ block: "center" });
      else card?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusKey, open, focusIdx]);

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
    <div ref={cardRef} style={s.fileCard}>
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
      {lineMissing && (
        <div role="status" style={s.focusNotice}>
          {t("diffViewer.lineNotChanged", { line: focusLine })}
        </div>
      )}
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
                highlighted={i === focusIdx}
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
