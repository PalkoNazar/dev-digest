/* ContextDocsPanel — the document list shared by the agent and skill Context tabs
   (L05): "Filter documents" (AC-18), one DocRow per view row, and the Preview modal
   (AC-19). Every change hands the owner's whole ordered path list to `onChange`; the
   caller saves it and passes the server's answer back as `view` (not optimistic). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { ContextAttachments } from "@devdigest/shared";
import { DocPreviewModal } from "./_components/DocPreviewModal";
import { DocRow } from "./_components/DocRow";
import { detachPath, filterRows, movePath, ownPaths, togglePath } from "./helpers";
import { s } from "./styles";

export function ContextDocsPanel({
  repoId,
  view,
  pending,
  onChange,
  heading,
  hint,
}: {
  repoId: string;
  view: ContextAttachments;
  /** A save is in flight: every control that changes the list is disabled. */
  pending: boolean;
  onChange: (paths: string[]) => void;
  /** Title + count shown left of the filter field. */
  heading?: React.ReactNode;
  /** One line under the header, above the list. */
  hint?: React.ReactNode;
}) {
  const t = useTranslations("context");
  const [filter, setFilter] = React.useState("");
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  const own = ownPaths(view.rows);
  const visible = filterRows(view.rows, filter);

  let list: React.ReactNode;
  if (view.rows.length === 0) list = <div style={s.empty}>{t("panel.noDocs")}</div>;
  else if (visible.length === 0) list = <div style={s.empty}>{t("panel.noMatch", { query: filter })}</div>;
  else
    list = (
      <ul style={s.list}>
        {visible.map((row) => {
          const at = own.indexOf(row.path);
          return (
            <DocRow
              key={row.path}
              row={row}
              pending={pending}
              canMoveUp={at > 0}
              canMoveDown={at >= 0 && at < own.length - 1}
              actions={{
                onToggle: () => onChange(togglePath(own, row.path)),
                onMove: (dir) => onChange(movePath(own, row.path, dir)),
                onDetach: () => onChange(detachPath(own, row.path)),
                onPreview: () => setPreviewPath(row.path),
              }}
            />
          );
        })}
      </ul>
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        {heading}
        <div style={s.filter}>
          <Icon.Search size={13} style={s.muted} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("panel.filterPlaceholder")}
            aria-label={t("panel.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      {hint && <p style={s.hint}>{hint}</p>}
      {list}
      {previewPath && <DocPreviewModal repoId={repoId} path={previewPath} onClose={() => setPreviewPath(null)} />}
    </div>
  );
}
