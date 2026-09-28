/* SkillBodyField — the skill body editor of CreateSkillModal: file bar
   (`name.md · unsaved · ≈N tokens`) with Write / Preview. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Chip, FormField, Icon, Markdown, Textarea } from "@devdigest/ui";
import { approxTokens } from "@/lib/token-estimate";
import { s } from "./styles";

export function SkillBodyField({
  name,
  body,
  onChange,
  error,
}: {
  name: string;
  body: string;
  onChange: (body: string) => void;
  error?: string;
}) {
  const t = useTranslations("conventions");
  const [preview, setPreview] = React.useState(false);

  return (
    <FormField label={t("modal.body")} required hint={error ? <span style={s.error}>{error}</span> : undefined}>
      <div style={s.fileBar}>
        <Icon.FileText size={14} style={s.muted} />
        <span className="mono" style={s.fileName}>
          {name}.md
        </span>
        <Badge color="var(--text-muted)">{t("modal.unsaved")}</Badge>
        <span style={s.tokens}>{t("modal.tokens", { count: approxTokens(body) })}</span>
        <Chip active={!preview} onClick={() => setPreview(false)}>
          {t("modal.write")}
        </Chip>
        <Chip active={preview} onClick={() => setPreview(true)}>
          {t("modal.preview")}
        </Chip>
      </div>
      {preview ? (
        <div style={s.preview}>
          <Markdown>{body}</Markdown>
        </div>
      ) : (
        <Textarea value={body} onChange={onChange} rows={16} mono />
      )}
    </FormField>
  );
}
