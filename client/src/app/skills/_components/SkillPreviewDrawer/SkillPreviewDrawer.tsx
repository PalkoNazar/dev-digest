/* SkillPreviewDrawer — side preview of one skill: meta, directive description,
   rendered body; Edit → /skills/:id, Delete (confirm), global enabled toggle. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, Icon, Markdown, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPE_COLOR } from "@/lib/skill-types";
import { s } from "./styles";

export function SkillPreviewDrawer({ skill, onClose }: { skill: Skill; onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const color = SKILL_TYPE_COLOR[skill.type];

  const remove = () => {
    if (!window.confirm(t("preview.deleteConfirm", { name: skill.name }))) return;
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("preview.deleted", { name: skill.name }));
        onClose();
      },
    });
  };

  return (
    <Drawer
      width={560}
      title={<span className="mono">{skill.name}</span>}
      subtitle={t("preview.version", { version: skill.version })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="danger" size="sm" icon="Trash" onClick={remove} disabled={del.isPending}>
            {t("preview.delete")}
          </Button>
          <Button kind="primary" size="sm" icon="Edit" onClick={() => router.push(`/skills/${skill.id}`)}>
            {t("preview.edit")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.metaRow}>
          <Badge color={color.fg} bg={color.bg}>
            {t(`type.${skill.type}`)}
          </Badge>
          <Badge>{t(`source.${skill.source}`)}</Badge>
          <label style={s.enabled}>
            {skill.enabled ? t("preview.enabled") : t("preview.disabled")}
            <Toggle
              on={skill.enabled}
              onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
              size={14}
            />
          </label>
        </div>
        {skill.source !== "manual" && (
          <div style={s.notice}>
            <Icon.AlertTriangle size={14} style={s.noticeIcon} />
            <span>{t("preview.importedNotice")}</span>
          </div>
        )}
        <section>
          <h3 style={s.label}>{t("preview.description")}</h3>
          <p style={s.description}>{skill.description}</p>
        </section>
        <section>
          <h3 style={s.label}>{t("preview.body")}</h3>
          <div style={s.markdown}>
            <Markdown>{skill.body}</Markdown>
          </div>
        </section>
      </div>
    </Drawer>
  );
}
