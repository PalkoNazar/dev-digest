/* ConventionCard — one extracted convention: the rule (editable inline), its
   code-verified evidence, measured confidence/adherence, and Accept / Reject. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, IconBtn, ProgressBar, Textarea } from "@devdigest/ui";
import type { ConventionCandidate, ConventionUpdate } from "@devdigest/shared";
import { useToast } from "@/lib/toast";
import { SNIPPET_MAX_LINES } from "../../constants";
import { evidenceLabel } from "../../helpers";
import { adherenceParts, confidenceColor } from "./helpers";
import { s } from "./styles";

export function ConventionCard({
  candidate,
  onUpdate,
  busy,
}: {
  candidate: ConventionCandidate;
  onUpdate: (patch: ConventionUpdate) => void;
  busy?: boolean;
}) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(candidate.rule);
  const [primary, ...more] = candidate.evidence;
  const pct = Math.round(candidate.confidence * 100);
  const adherence = adherenceParts(candidate);
  const accepted = candidate.status === "accepted";
  const rejected = candidate.status === "rejected";

  const startEdit = () => {
    setDraft(candidate.rule);
    setEditing(true);
  };
  const saveEdit = () => {
    const rule = draft.trim();
    if (rule && rule !== candidate.rule) onUpdate({ rule });
    setEditing(false);
  };
  const copy = () => {
    if (!primary) return;
    void navigator.clipboard?.writeText(primary.snippet).then(() => toast.success(t("card.copied")));
  };

  return (
    <article style={s.card(candidate.status)} aria-label={candidate.rule}>
      <div style={s.main}>
        <div style={s.meta}>
          <Badge color="var(--text-secondary)">{t(`category.${candidate.category}`)}</Badge>
          {candidate.enforced_by && (
            <Badge color="var(--warn)">{t("card.enforcedBy", { tool: candidate.enforced_by })}</Badge>
          )}
          {candidate.edited && <Badge color="var(--text-muted)">{t("card.edited")}</Badge>}
          {candidate.skill_id && <Badge color="var(--ok)">{t("card.inSkill")}</Badge>}
        </div>

        {editing ? (
          <div style={s.editRow}>
            <Textarea value={draft} onChange={setDraft} rows={2} />
            <div style={s.editActions}>
              <Button kind="primary" size="sm" icon="Check" onClick={saveEdit} disabled={!draft.trim()}>
                {t("card.save")}
              </Button>
              <Button kind="ghost" size="sm" onClick={() => setEditing(false)}>
                {t("card.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div style={s.ruleRow}>
            <h3 style={s.rule}>{candidate.rule}</h3>
            <IconBtn icon="Edit" label={t("card.edit")} onClick={startEdit} />
          </div>
        )}

        {primary && (
          <div style={s.evidence}>
            <div style={s.evidenceBar}>
              <span className="mono" style={s.evidencePath}>
                {evidenceLabel(primary)}
              </span>
              {more.length > 0 && (
                <span style={s.more} title={more.map(evidenceLabel).join("\n")}>
                  {t("card.moreEvidence", { count: more.length })}
                </span>
              )}
              <IconBtn icon="Copy" label={t("card.copy")} onClick={copy} />
            </div>
            <pre className="mono" style={s.snippet}>
              {primary.snippet.split("\n").slice(0, SNIPPET_MAX_LINES).join("\n")}
            </pre>
          </div>
        )}

        <div style={s.scoreRow}>
          <span style={s.scoreLabel}>{t("card.confidence")}</span>
          <div style={s.bar}>
            <ProgressBar value={pct} color={confidenceColor(candidate.confidence)} />
          </div>
          <span className="mono tnum" style={s.pct}>
            {pct}%
          </span>
          <span style={s.adherence}>
            {adherence.kind === "measured"
              ? t("card.adherence", adherence)
              : adherence.kind === "support"
                ? t("card.supportOnly", { count: adherence.count })
                : t("card.unmeasured")}
          </span>
        </div>
      </div>

      <div style={s.actions}>
        <Button
          kind={accepted ? "primary" : "secondary"}
          icon="Check"
          full
          disabled={busy}
          aria-pressed={accepted}
          onClick={() => onUpdate({ status: accepted ? "pending" : "accepted" })}
        >
          {accepted ? t("card.accepted") : t("card.accept")}
        </Button>
        <Button
          kind={rejected ? "danger" : "ghost"}
          icon="X"
          full
          disabled={busy}
          aria-pressed={rejected}
          onClick={() => onUpdate({ status: rejected ? "pending" : "rejected" })}
        >
          {rejected ? t("card.rejected") : t("card.reject")}
        </Button>
      </div>
    </article>
  );
}
