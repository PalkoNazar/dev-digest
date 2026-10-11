/* RoleGroup — one Smart Diff group (core, tests, wiring, docs, boilerplate):
   a sticky clickable header and, when open, the group's files in a DiffViewer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile, SmartDiffRole } from "@devdigest/shared";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { DEFAULT_COLLAPSED, ROLE_META } from "./constants";
import { s } from "./styles";

export function RoleGroup({
  role,
  files,
  filesWithFindings,
  commenting,
  findingApi,
}: {
  role: SmartDiffRole;
  files: PrFile[];
  /** Files of this group with a counted (non-dismissed) finding. */
  filesWithFindings: number;
  commenting?: DiffCommentApi;
  findingApi?: DiffFindingApi;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(!DEFAULT_COLLAPSED.has(role));
  const meta = ROLE_META[role];

  return (
    <section style={s.root} data-role={role}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={s.header}
      >
        <Icon.ChevronRight size={13} style={s.chevron(open)} />
        <span aria-hidden style={s.square(meta.color)} />
        <span style={s.label}>{t(meta.labelKey)}</span>
        <span style={s.hint}>{t(meta.hintKey)}</span>
        {filesWithFindings > 0 && (
          <span
            style={s.findings}
            title={t("smartDiff.filesWithFindings", { count: filesWithFindings })}
            aria-label={t("smartDiff.filesWithFindings", { count: filesWithFindings })}
          >
            ● {filesWithFindings}
          </span>
        )}
        <span style={s.count}>{t("smartDiff.filesCount", { count: files.length })}</span>
      </button>
      {open && <DiffViewer files={files} commenting={commenting} findingApi={findingApi} />}
    </section>
  );
}
