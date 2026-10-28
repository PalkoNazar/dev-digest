/* ReviewFocus — "Review focus — read these first": the brief's starting points, in the
   order the brief returned them. Each item is a button that opens Files changed on its
   file and line; a file outside the PR's diff shows a notice instead. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import { isChangedFile } from "../../helpers";
import { s } from "./styles";

interface ReviewFocusProps {
  items: ReviewFocusItem[];
  changedFiles: readonly string[];
  onOpenInDiff: (path: string, line: number | null) => void;
}

export function ReviewFocus({ items, changedFiles, onOpenInDiff }: ReviewFocusProps) {
  const t = useTranslations("brief");
  const [missing, setMissing] = React.useState<number | null>(null);
  const reasonIdPrefix = React.useId();

  const open = (index: number, item: ReviewFocusItem) => {
    if (isChangedFile(item.file, changedFiles)) {
      setMissing(null);
      onOpenInDiff(item.file, item.line);
    } else {
      setMissing(index);
    }
  };

  return (
    <section style={s.section}>
      <SectionLabel
        icon="ListChecks"
        right={<span style={s.count}>{t("focus.count", { count: items.length })}</span>}
      >
        {t("focus.heading")}
      </SectionLabel>
      {items.length === 0 ? (
        <div style={s.empty}>{t("focus.empty")}</div>
      ) : (
        <ol style={s.list}>
          {items.map((item, i) => {
            const ref = item.line != null ? `${item.file}:${item.line}` : item.file;
            const reasonId = `${reasonIdPrefix}-reason-${i}`;
            return (
              <li key={`${i}:${ref}`} style={s.item}>
                <button
                  type="button"
                  style={s.button}
                  title={ref}
                  aria-label={
                    item.line != null
                      ? t("focus.open", { path: item.file, line: item.line })
                      : t("focus.openNoLine", { path: item.file })
                  }
                  aria-describedby={reasonId}
                  onClick={() => open(i, item)}
                >
                  <span aria-hidden style={s.bullet}>
                    ▸
                  </span>
                  <span className="mono" style={s.path}>
                    {ref}
                  </span>
                  <span id={reasonId} style={s.reason}>
                    — {item.reason}
                  </span>
                </button>
                {item.outside_changed_lines && <span style={s.hint}>{t("focus.lineOutside")}</span>}
                {missing === i && (
                  <span role="status" style={s.missing}>
                    {t("notInDiff")}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
