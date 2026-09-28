/* CreateSkillModal — merge the accepted conventions into one editable skill
   (name, description, type, enabled, body) and link it to the chosen agents.
   If a skill with that name exists, saving updates it (version bump). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, FormField, Icon, Modal, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { ConventionCandidate, SkillType } from "@devdigest/shared";
import { useAgents } from "@/lib/hooks/agents";
import { useUpdateConvention } from "@/lib/hooks/conventions";
import { useCreateSkill, useLinkSkillToAgent, useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { SKILL_TYPES } from "@/lib/skill-types";
import { useToast } from "@/lib/toast";
import { buildSkillBody, skillNameFor } from "../../helpers";
import { SkillBodyField } from "./_components/SkillBodyField";
import { draftErrors, type SkillFromConventionsDraft } from "./helpers";
import { s } from "./styles";

export function CreateSkillModal({
  repoId,
  repoFullName,
  accepted,
  onClose,
}: {
  repoId: string;
  repoFullName: string;
  accepted: ConventionCandidate[];
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const tSkills = useTranslations("skills");
  const toast = useToast();
  const { data: skills } = useSkills();
  const { data: agents } = useAgents();
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const link = useLinkSkillToAgent();
  const updateConvention = useUpdateConvention(repoId);

  const [draft, setDraft] = React.useState<SkillFromConventionsDraft>(() => ({
    name: skillNameFor(repoFullName),
    description: t("modal.descriptionDefault", { count: accepted.length, repo: repoFullName }),
    type: "convention",
    enabled: true,
    body: buildSkillBody(repoFullName, accepted),
  }));
  const [agentIds, setAgentIds] = React.useState<string[]>([]);
  const [touched, setTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const set = <K extends keyof SkillFromConventionsDraft>(key: K, value: SkillFromConventionsDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const toggleAgent = (id: string, on: boolean) =>
    setAgentIds((ids) => (on ? [...ids, id] : ids.filter((x) => x !== id)));

  const existing = skills?.find((sk) => sk.name === draft.name);
  const errors = touched ? draftErrors(draft) : {};
  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: tSkills(`type.${v}`) }));

  const save = async () => {
    setTouched(true);
    if (Object.keys(draftErrors(draft)).length > 0) return;
    setSaving(true);
    try {
      const fields = {
        description: draft.description.trim(),
        type: draft.type,
        body: draft.body,
        enabled: draft.enabled,
      };
      const skill = existing
        ? await update.mutateAsync({ id: existing.id, patch: fields })
        : await create.mutateAsync({ name: draft.name, ...fields, source: "extracted" });
      for (const agentId of agentIds) await link.mutateAsync({ agentId, skillId: skill.id });
      await Promise.all(
        accepted.map((c) => updateConvention.mutateAsync({ id: c.id, patch: { skill_id: skill.id } })),
      );
      toast.success(
        existing
          ? t("modal.updated", { name: skill.name, version: skill.version })
          : t("modal.created", { name: skill.name }),
      );
      if (agentIds.length > 0) toast.success(t("modal.linked", { count: agentIds.length }));
      onClose();
    } catch {
      // the failed mutation already raised its error toast; keep the draft open
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      width={860}
      title={existing ? t("modal.titleUpdate") : t("modal.title")}
      subtitle={<span className="mono">{draft.name}</span>}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>
            <Icon.GitCommit size={13} /> {t("modal.footer")}
          </span>
          <Button kind="secondary" onClick={onClose} disabled={saving}>
            {t("modal.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={save} loading={saving}>
            {saving ? t("modal.saving") : existing ? t("modal.update") : t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.banner}>
          <Icon.Wrench size={14} />
          <span>{t("modal.merged", { count: accepted.length, repo: repoFullName })}</span>
        </div>
        {existing && (
          <div style={s.warn}>
            {t("modal.existing", { name: existing.name, version: existing.version + 1 })}
          </div>
        )}

        <FormField
          label={t("modal.name")}
          required
          hint={errors.name ? <span style={s.error}>{t("modal.nameInvalid")}</span> : undefined}
        >
          <TextInput value={draft.name} onChange={(v) => set("name", v)} mono aria-label={t("modal.name")} />
        </FormField>
        <FormField
          label={t("modal.description")}
          required
          hint={errors.description ? <span style={s.error}>{t("modal.required")}</span> : undefined}
        >
          <TextInput
            value={draft.description}
            onChange={(v) => set("description", v)}
            aria-label={t("modal.description")}
          />
        </FormField>
        <div style={s.row}>
          <div style={s.col}>
            <FormField label={t("modal.type")}>
              <SelectInput
                value={draft.type}
                onChange={(v) => set("type", v as SkillType)}
                options={typeOptions}
                mono={false}
              />
            </FormField>
          </div>
          <div style={s.col}>
            <FormField label={t("modal.enabled")} hint={t("modal.enabledHint")}>
              <Toggle on={draft.enabled} onChange={(v) => set("enabled", v)} size={16} />
            </FormField>
          </div>
        </div>

        <SkillBodyField
          name={draft.name}
          body={draft.body}
          onChange={(v) => set("body", v)}
          error={errors.body ? t("modal.required") : undefined}
        />

        <FormField label={t("modal.agents")} hint={t("modal.agentsHint")}>
          <div style={s.agents}>
            {(agents ?? []).length === 0 && <span style={s.muted}>{t("modal.noAgents")}</span>}
            {(agents ?? []).map((a) => (
              <Checkbox
                key={a.id}
                checked={agentIds.includes(a.id)}
                onChange={(on) => toggleAgent(a.id, on)}
                label={a.name}
              />
            ))}
          </div>
        </FormField>
      </div>
    </Modal>
  );
}
