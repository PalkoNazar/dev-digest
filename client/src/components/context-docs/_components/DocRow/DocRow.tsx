/* DocRow — one document row of a Context tab: attach checkbox (attached / available),
   "via <skills>" for inherited-only rows (AC-42), "also via" on attached rows (AC-46),
   a missing badge + Detach (AC-21), move up/down on own rows (AC-28), "≈ N tok" (AC-26)
   and Preview. Every control's accessible name contains the path (AC-29, AC-43). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Checkbox } from "@devdigest/ui";
import type { ContextDocRow } from "@devdigest/shared";
import { middleEllipsisPath } from "@/lib/path-ellipsis";
import { s } from "../../styles";

/** Characters of a row path before it is shortened in the middle. */
const ROW_PATH_MAX = 56;

export interface DocRowActions {
  onToggle: () => void;
  onMove: (dir: -1 | 1) => void;
  onDetach: () => void;
  onPreview: () => void;
}

export function DocRow({
  row,
  pending,
  canMoveUp,
  canMoveDown,
  actions,
}: {
  row: ContextDocRow;
  pending: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  actions: DocRowActions;
}) {
  const t = useTranslations("context");
  const { path, state, via } = row;
  const own = state === "attached" || state === "missing";
  // Cut in the middle so the start and the file name stay visible; the full path stays
  // in `title` and in the accessible name (AC-43).
  const shortPath = middleEllipsisPath(path, ROW_PATH_MAX);
  const pathLabel = (
    <span className="mono" style={s.path} title={path}>
      {shortPath === path ? (
        path
      ) : (
        <>
          <span aria-hidden="true">{shortPath}</span>
          <span style={s.srOnly}>{path}</span>
        </>
      )}
    </span>
  );
  return (
    <li style={s.row(own)}>
      {state === "attached" || state === "available" ? (
        // The checkbox is named by its label = the full path (AC-29, AC-43).
        <span style={s.check(pending)}>
          <Checkbox checked={state === "attached"} onChange={() => !pending && actions.onToggle()} label={pathLabel} />
        </span>
      ) : (
        <span style={s.check(false)}>{pathLabel}</span>
      )}
      {state === "inherited" && <span style={s.via}>{t("panel.via", { skills: via.join(", ") })}</span>}
      {state === "attached" && via.length > 0 && (
        <span style={s.via}>{t("panel.alsoVia", { skills: via.join(", ") })}</span>
      )}
      {state === "missing" && (
        <Badge color="var(--warn)" bg="var(--warn-bg)">
          {t("panel.missing")}
        </Badge>
      )}
      <span style={s.rowRight}>
        <Badge>{row.category}</Badge>
        <span className="mono" style={s.tokens}>
          {t("panel.tokens", { tokens: row.tokens })}
        </span>
        {own && (
          <RowIconBtn
            icon="ArrowUp"
            label={t("panel.moveUp", { path })}
            disabled={pending || !canMoveUp}
            onClick={() => actions.onMove(-1)}
          />
        )}
        {own && (
          <RowIconBtn
            icon="ArrowDown"
            label={t("panel.moveDown", { path })}
            disabled={pending || !canMoveDown}
            onClick={() => actions.onMove(1)}
          />
        )}
        {state === "missing" && (
          <RowIconBtn icon="X" label={t("panel.detach", { path })} disabled={pending} onClick={actions.onDetach} />
        )}
        {state !== "missing" && (
          <Button
            kind="secondary"
            size="sm"
            icon="Eye"
            title={t("panel.previewLabel", { path })}
            aria-label={t("panel.previewLabel", { path })}
            onClick={actions.onPreview}
          >
            {t("panel.preview")}
          </Button>
        )}
      </span>
    </li>
  );
}

/** Icon-only row control; `label` (with the path) is its accessible name and tooltip. */
function RowIconBtn({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: "ArrowUp" | "ArrowDown" | "X";
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return <Button kind="ghost" size="sm" icon={icon} title={label} aria-label={label} disabled={disabled} onClick={onClick} />;
}
