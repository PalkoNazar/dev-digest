/* SkillDeleteDialog — confirm modal before a skill is deleted (detached from every
   agent, history gone). Used by the list card and the Config tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";

export function SkillDeleteDialog({
  skill,
  onClose,
  onDeleted,
}: {
  skill: Skill;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const del = useDeleteSkill();

  return (
    <ConfirmDialog
      title={t("delete.title")}
      body={t("preview.deleteConfirm", { name: skill.name })}
      confirmLabel={del.isPending ? t("delete.deleting") : t("delete.confirm")}
      cancelLabel={t("delete.cancel")}
      pending={del.isPending}
      onCancel={onClose}
      onConfirm={() =>
        del.mutate(skill.id, {
          onSuccess: () => {
            toast.success(t("preview.deleted", { name: skill.name }));
            onClose();
            onDeleted?.();
          },
        })
      }
    />
  );
}
