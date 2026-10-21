/* RiskAreas — the brief's risks: severity icon (+ text for assistive tech), title,
   file refs that jump to Files changed, and an expandable explanation. Model text is
   rendered as plain React text only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SectionLabel } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { isChangedFile, parseFileRef } from "../../helpers";
import { RISK_SEVERITY_META } from "./constants";
import { s } from "./styles";

interface RiskAreasProps {
  risks: Risk[];
  changedFiles: readonly string[];
  onOpenInDiff: (path: string, line: number | null) => void;
}

export function RiskAreas({ risks, changedFiles, onOpenInDiff }: RiskAreasProps) {
  const t = useTranslations("brief");
  return (
    <section style={s.section}>
      <SectionLabel icon="AlertTriangle">{t("block.riskAreas")}</SectionLabel>
      {risks.length === 0 ? (
        <div style={s.empty}>{t("noRisks")}</div>
      ) : (
        <ul style={s.list}>
          {risks.map((risk, i) => (
            <RiskItem
              key={`${i}:${risk.title}`}
              risk={risk}
              changedFiles={changedFiles}
              onOpenInDiff={onOpenInDiff}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function RiskItem({ risk, changedFiles, onOpenInDiff }: { risk: Risk } & Omit<RiskAreasProps, "risks">) {
  const t = useTranslations("brief");
  const [open, setOpen] = React.useState(false);
  const [missingRef, setMissingRef] = React.useState<string | null>(null);
  const meta = RISK_SEVERITY_META[risk.severity];
  const SevIcon = Icon[meta.icon];

  const openRef = (ref: string) => {
    const { path, line } = parseFileRef(ref);
    if (isChangedFile(path, changedFiles)) {
      setMissingRef(null);
      onOpenInDiff(path, line);
    } else {
      setMissingRef(ref);
    }
  };

  return (
    <li style={s.item}>
      <div style={s.titleRow}>
        <SevIcon size={14} style={s.icon(meta.color)} aria-hidden />
        <span style={s.srOnly}>{t(`severity.${risk.severity}`)}</span>
        <span style={s.title}>{risk.title}</span>
        <button
          type="button"
          style={s.expand}
          aria-expanded={open}
          aria-label={t(open ? "risk.collapse" : "risk.expand", { title: risk.title })}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon.ChevronDown size={14} style={s.chevron(open)} />
        </button>
      </div>
      {risk.file_refs.length > 0 && (
        <div style={s.refs}>
          {risk.file_refs.map((ref) => {
            const { path, line } = parseFileRef(ref);
            return (
              <button
                key={ref}
                type="button"
                className="mono"
                style={s.ref}
                title={ref}
                aria-label={
                  line != null ? t("focus.open", { path, line }) : t("focus.openNoLine", { path })
                }
                onClick={() => openRef(ref)}
              >
                {ref}
              </button>
            );
          })}
        </div>
      )}
      {missingRef && (
        <div role="status" style={s.missing}>
          {t("notInDiff")}
        </div>
      )}
      {open && (
        <p style={s.explanation}>
          {risk.explanation}
        </p>
      )}
    </li>
  );
}
