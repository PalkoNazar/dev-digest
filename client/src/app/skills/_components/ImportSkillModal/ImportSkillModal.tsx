/* ImportSkillModal — import a skill from a .md file or a .zip skill folder.
   1) pick a file → the server parses it into a preview (nothing is stored);
   2) the user reviews the core (name, description, type, rendered body), the
      ignored archive entries and the warnings;
   3) only "Save skill" creates it — imported skills start disabled. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  FormField,
  Icon,
  Markdown,
  Modal,
  SelectInput,
  TextInput,
  Textarea,
  Toggle,
} from "@devdigest/ui";
import type { Skill, SkillImportPreview, SkillType } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useCreateSkill, useImportSkillPreview } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPES } from "@/lib/skill-types";
import { validateSkillDraft, type SkillDraft } from "../../helpers";
import { ACCEPTED_EXTENSIONS, MAX_IMPORT_BYTES, fileToBase64, isAcceptedFile } from "./helpers";
import { s } from "./styles";

export function ImportSkillModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved?: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const previewMut = useImportSkillPreview();
  const create = useCreateSkill();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [draft, setDraft] = React.useState<SkillDraft | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!isAcceptedFile(file.name)) return setError(t("import.pickHint"));
    if (file.size > MAX_IMPORT_BYTES) return setError(t("import.pickHint"));
    try {
      const content_base64 = await fileToBase64(file);
      const p = await previewMut.mutateAsync({ filename: file.name, content_base64 });
      setPreview(p);
      setDraft({ name: p.name, description: p.description, type: p.type, body: p.body, enabled: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const back = () => {
    setPreview(null);
    setDraft(null);
    setError(null);
  };

  const errors = draft ? validateSkillDraft(draft) : {};
  const canSave = !!draft && Object.keys(errors).length === 0 && !create.isPending;

  const save = () => {
    if (!draft || !canSave) return;
    setError(null);
    create.mutate(
      { ...draft, description: draft.description.trim(), source: "imported_file" },
      {
        onSuccess: (skill) => {
          toast.success(t("import.saved", { name: skill.name }));
          onSaved?.(skill);
        },
        onError: (e) => setError(e instanceof ApiError ? e.message : String(e)),
      },
    );
  };

  const set = <K extends keyof SkillDraft>(key: K, value: SkillDraft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  return (
    <Modal
      width={760}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {preview && (
            <Button kind="ghost" size="sm" onClick={back}>
              {t("import.back")}
            </Button>
          )}
          <div style={s.footerRight}>
            <Button kind="secondary" size="sm" onClick={onClose}>
              {t("import.cancel")}
            </Button>
            {preview && (
              <Button kind="primary" size="sm" icon="Check" onClick={save} disabled={!canSave}>
                {create.isPending ? t("import.saving") : t("import.confirm")}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        style={{ display: "none" }}
        data-testid="skill-file-input"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {error && (
        <div role="alert" style={s.error}>
          {error}
        </div>
      )}

      {!preview || !draft ? (
        <FormField label={t("import.pickLabel")} hint={t("import.pickHint")}>
          <Button
            kind="secondary"
            icon="Upload"
            onClick={() => inputRef.current?.click()}
            disabled={previewMut.isPending}
          >
            {previewMut.isPending ? t("import.parsing") : t("import.choose")}
          </Button>
        </FormField>
      ) : (
        <div style={s.review}>
          <div style={s.trust}>
            <Icon.Shield size={16} style={s.trustIcon} />
            <div>
              <div style={s.trustTitle}>{t("import.trustTitle")}</div>
              <div>{t("import.trustBody")}</div>
            </div>
          </div>

          <div style={s.sourceRow}>
            <span style={s.muted}>{t("import.sourceFile")}</span>
            <span className="mono">{preview.source_file}</span>
          </div>

          {preview.warnings.length > 0 && (
            <div style={s.warnings}>
              <div style={s.sectionTitle}>{t("import.warningsTitle")}</div>
              <ul style={s.list}>
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <FormField label={t("editor.name")} required hint={errors.name ? t("editor.nameInvalid") : undefined}>
            <TextInput value={draft.name} onChange={(v) => set("name", v)} mono aria-label={t("editor.name")} />
          </FormField>
          <FormField
            label={t("editor.description")}
            required
            hint={errors.description ? t("editor.required") : t("editor.descriptionHint")}
          >
            <Textarea value={draft.description} onChange={(v) => set("description", v)} rows={2} />
          </FormField>
          <div style={s.row}>
            <FormField label={t("editor.type")}>
              <SelectInput
                value={draft.type}
                onChange={(v) => set("type", v as SkillType)}
                options={SKILL_TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }))}
                mono={false}
              />
            </FormField>
            <FormField label={t("import.enableNow")} hint={t("import.enableHint")}>
              <Toggle on={draft.enabled} onChange={(v) => set("enabled", v)} size={16} />
            </FormField>
          </div>

          <div style={s.sectionTitle}>{t("import.bodyPreview")}</div>
          <div style={s.body}>
            <Markdown>{draft.body}</Markdown>
          </div>

          {preview.ignored_files.length > 0 && (
            <div>
              <div style={s.sectionTitle}>
                {t("import.ignoredTitle", { count: preview.ignored_files.length })}
              </div>
              <div style={s.muted}>{t("import.ignoredHint")}</div>
              <div style={s.ignored}>
                {preview.ignored_files.map((f) => (
                  <Badge key={f} mono color="var(--text-muted)" icon="Slash">
                    {f}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
