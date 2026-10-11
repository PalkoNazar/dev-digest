/* SpecsPromptBlock — the "Project context" prompt segment of a run trace (L05):
   a collapsible block with one expandable row per injected document, each showing
   the text exactly as it was injected (untrusted repo content, rendered as text). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { TraceSpecDoc } from "@devdigest/shared";
import { s } from "../../styles";

export function SpecsPromptBlock({ docs, color }: { docs: TraceSpecDoc[]; color: string }) {
  const t = useTranslations("runs");
  const [open, setOpen] = React.useState(false);
  const tokens = docs.reduce((sum, d) => sum + (d.tokens ?? 0), 0);
  return (
    <div style={s.promptRow}>
      <div onClick={() => setOpen((o) => !o)} style={s.promptHead}>
        <span style={s.promptDot(color)} />
        <span style={s.promptLabel}>{t("trace.prompt.specs")}</span>
        <span style={s.promptMeta}>{t("trace.prompt.specsMeta", { count: docs.length, tokens })}</span>
        <span style={s.promptToggle}>{open ? t("trace.collapse") : t("trace.expand")}</span>
      </div>
      {open && docs.map((doc) => <SpecDocRow key={doc.path} doc={doc} />)}
    </div>
  );
}

function SpecDocRow({ doc }: { doc: TraceSpecDoc }) {
  const t = useTranslations("runs");
  const [open, setOpen] = React.useState(false);
  return (
    <div style={s.specDocRow}>
      <div onClick={() => setOpen((o) => !o)} style={s.specDocHead}>
        <span className="mono" style={s.spec}>
          {doc.path}
        </span>
        {doc.status === "truncated" && <Badge color="var(--warn)">{t("trace.specs.truncated")}</Badge>}
        {doc.tokens != null && (
          <span style={s.promptToggle}>{t("trace.specs.tokens", { tokens: doc.tokens })}</span>
        )}
      </div>
      {open && (
        <pre className="mono" style={s.promptPre}>
          {doc.text ?? ""}
        </pre>
      )}
    </div>
  );
}
