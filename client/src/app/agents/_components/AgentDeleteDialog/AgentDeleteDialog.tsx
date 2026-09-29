/* AgentDeleteDialog — confirm modal before an agent is deleted from the DB
   (its skill links go with it). Used by the /agents grid and the editor's list. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useDeleteAgent } from "@/lib/hooks/agents";
import { useToast } from "@/lib/toast";

export function AgentDeleteDialog({
  agent,
  onClose,
  onDeleted,
}: {
  agent: Agent;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const t = useTranslations("agents");
  const toast = useToast();
  const del = useDeleteAgent();

  return (
    <ConfirmDialog
      title={t("delete.title")}
      body={t("delete.body", { name: agent.name })}
      confirmLabel={del.isPending ? t("delete.deleting") : t("delete.confirm")}
      cancelLabel={t("delete.cancel")}
      pending={del.isPending}
      onCancel={onClose}
      onConfirm={() =>
        del.mutate(agent.id, {
          onSuccess: () => {
            toast.success(t("delete.deleted", { name: agent.name }));
            onClose();
            onDeleted?.();
          },
        })
      }
    />
  );
}
