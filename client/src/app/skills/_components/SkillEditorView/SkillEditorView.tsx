/* SkillEditorView — /skills/new and /skills/:id: loads the skill (edit mode),
   frames SkillEditor in the app shell, routes after create / delete. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api";
import { useDeleteSkill, useSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SkillEditor } from "../SkillEditor";
import { s } from "./styles";

export function SkillEditorView({ id }: { id?: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const del = useDeleteSkill();

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: id ? (skill?.name ?? "…") : t("editor.crumbNew") },
  ];

  const remove = () => {
    if (!skill || !window.confirm(t("preview.deleteConfirm", { name: skill.name }))) return;
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("preview.deleted", { name: skill.name }));
        router.push("/skills");
      },
    });
  };

  let content: React.ReactNode;
  if (id && isLoading) {
    content = (
      <div style={s.loading}>
        <Skeleton height={24} width={240} />
        <Skeleton height={320} />
      </div>
    );
  } else if (id && isError && error instanceof ApiError && error.status === 404) {
    content = <EmptyState icon="Sparkles" title={t("editor.notFoundTitle")} body={t("editor.notFoundBody")} />;
  } else if (id && (isError || !skill)) {
    content = <ErrorState body={t("editor.loadError")} onRetry={() => refetch()} />;
  } else {
    content = (
      <SkillEditor
        skill={skill}
        onSaved={(saved) => {
          if (!id) router.replace(`/skills/${saved.id}`);
        }}
        onCancel={() => router.push("/skills")}
        onDelete={remove}
      />
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <Link href="/skills" style={s.back}>
          {t("editor.back")}
        </Link>
        {content}
      </div>
    </AppShell>
  );
}
