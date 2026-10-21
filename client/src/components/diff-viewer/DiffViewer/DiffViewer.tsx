/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline.
   Optional review findings (Smart Diff) render through `findingApi`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import { type DiffFindingApi } from "../findings";
import { type DiffFocus } from "../focus";
import { s } from "../styles";
import { FileCard } from "../FileCard";

export function DiffViewer({
  files,
  commenting,
  findingApi,
  focus,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  /** Optional review findings shown inline (dot, line marker, cards). */
  findingApi?: DiffFindingApi;
  /** Optional jump target; the matching FileCard opens, highlights and scrolls. */
  focus?: DiffFocus | null;
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  return (
    <div style={s.list}>
      {files.map((f, i) => (
        <FileCard key={i} file={f} commenting={commenting} findingApi={findingApi} focus={focus} />
      ))}
    </div>
  );
}
