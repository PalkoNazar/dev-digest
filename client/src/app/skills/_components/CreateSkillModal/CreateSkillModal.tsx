/* CreateSkillModal — "Add skill → Create skill": the skill form (name,
   description, type, markdown body) in a modal over the list. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillEditor } from "../SkillEditor";
import { s } from "./styles";

export function CreateSkillModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  return (
    <Modal width={820} title={t("editor.titleNew")} subtitle={t("editor.subtitleNew")} onClose={onClose}>
      <div style={s.body}>
        <SkillEditor embedded onSaved={onSaved} onCancel={onClose} />
      </div>
    </Modal>
  );
}
