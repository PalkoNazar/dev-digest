/* SkillEditor — the skill form: name, directive description, type, markdown
   body (write / preview) and the global enabled switch. Creates when `skill`
   is absent, otherwise saves a patch (a body change bumps the version). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Chip,
  Icon,
  FormField,
  Markdown,
  SelectInput,
  TextInput,
  Textarea,
  Toggle,
} from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPES } from "@/lib/skill-types";
import { approxTokens } from "@/lib/token-estimate";
import { isDirty, validateSkillDraft, type SkillDraft } from "../../helpers";
import { EMPTY_DRAFT } from "./constants";
import { s } from "./styles";

export function SkillEditor({
  skill,
  onSaved,
  onCancel,
  onDelete,
}: {
  skill?: Skill;
  onSaved?: (skill: Skill) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const [draft, setDraft] = React.useState<SkillDraft>(skill ?? EMPTY_DRAFT);
  const [preview, setPreview] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  // Reset the form when another skill is loaded.
  React.useEffect(() => {
    setDraft(skill ?? EMPTY_DRAFT);
    setTouched(false);
  }, [skill?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof SkillDraft>(key: K, value: SkillDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const errors = touched ? validateSkillDraft(draft) : {};
  const dirty = !!skill && isDirty(skill, draft);
  const pending = create.isPending || update.isPending;
  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }));

  const save = () => {
    setTouched(true);
    if (Object.keys(validateSkillDraft(draft)).length > 0) return;
    const input = {
      name: draft.name,
      description: draft.description.trim(),
      type: draft.type,
      body: draft.body,
      enabled: draft.enabled,
    };
    if (skill) {
      update.mutate(
        { id: skill.id, patch: input },
        {
          onSuccess: (saved) => {
            toast.success(t("editor.saved", { name: saved.name, version: saved.version }));
            onSaved?.(saved);
          },
        },
      );
    } else {
      create.mutate(input, {
        onSuccess: (saved) => {
          toast.success(t("editor.created", { name: saved.name }));
          onSaved?.(saved);
        },
      });
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>
          {skill ? t("editor.configuration") : t("editor.titleNew")}
        </h2>
        {skill && (
          <span className="mono" style={s.version}>
            {t("editor.version", { version: skill.version })}
          </span>
        )}
        <label style={s.enabled} title={t("editor.enabledHint")}>
          {t("editor.enabled")}
          <Toggle on={draft.enabled} onChange={(v) => set("enabled", v)} size={16} />
        </label>
      </div>

      <FormField
        label={t("editor.name")}
        required
        hint={errors.name ? <Err>{t("editor.nameInvalid")}</Err> : t("editor.nameHint")}
      >
        <TextInput
          value={draft.name}
          onChange={(v) => set("name", v)}
          placeholder={t("editor.namePlaceholder")}
          mono
          aria-label={t("editor.name")}
        />
      </FormField>
      <FormField
        label={t("editor.description")}
        required
        hint={errors.description ? <Err>{t("editor.required")}</Err> : t("editor.descriptionHint")}
      >
        <Textarea
          value={draft.description}
          onChange={(v) => set("description", v)}
          placeholder={t("editor.descriptionPlaceholder")}
          rows={2}
        />
      </FormField>
      <FormField label={t("editor.type")}>
        <SelectInput
          value={draft.type}
          onChange={(v) => set("type", v as SkillType)}
          options={typeOptions}
          mono={false}
        />
      </FormField>
      <FormField
        label={t("editor.bodyLabel")}
        required
        hint={errors.body ? <Err>{t("editor.required")}</Err> : t("editor.bodyHint")}
      >
        <div style={s.fileBar}>
          <Icon.FileText size={14} style={s.muted} />
          <span className="mono" style={s.fileName}>
            {(draft.name || t("editor.namePlaceholder")) + ".md"}
          </span>
          {dirty && <Badge color="var(--text-muted)">{t("editor.unsaved")}</Badge>}
          <span style={s.tokens}>{t("editor.tokens", { count: approxTokens(draft.body) })}</span>
          <div style={s.bodyTabs}>
            <Chip active={!preview} onClick={() => setPreview(false)}>
              {t("editor.write")}
            </Chip>
            <Chip active={preview} onClick={() => setPreview(true)}>
              {t("editor.previewTab")}
            </Chip>
          </div>
        </div>
        {preview ? (
          <div style={s.preview}>
            {draft.body.trim() ? (
              <Markdown>{draft.body}</Markdown>
            ) : (
              <span style={s.muted}>{t("editor.emptyPreview")}</span>
            )}
          </div>
        ) : (
          <Textarea
            value={draft.body}
            onChange={(v) => set("body", v)}
            placeholder={t("editor.bodyPlaceholder")}
            rows={16}
            mono
          />
        )}
      </FormField>

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={pending}>
          {skill
            ? update.isPending
              ? t("editor.saving")
              : t("editor.save")
            : create.isPending
              ? t("editor.creating")
              : t("editor.create")}
        </Button>
        {onCancel && (
          <Button kind="secondary" onClick={onCancel}>
            {t("editor.cancel")}
          </Button>
        )}
        {skill && onDelete && (
          <div style={s.deleteWrap}>
            <Button kind="danger" icon="Trash" onClick={onDelete}>
              {t("editor.delete")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Err({ children }: { children: React.ReactNode }) {
  return <span style={s.error}>{children}</span>;
}
