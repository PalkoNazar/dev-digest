/* SkillsWorkspace — /skills, /skills/new, /skills/:id (L02). Master-detail like
   the agent editor: skill cards on the left (search, "Add Skill" → create /
   import, both in a modal; delete with a confirm modal), the selected skill on
   the right. /skills/new opens the list with the create modal. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import type { Skill } from "@devdigest/shared";
import { useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { SkillDetail } from "../SkillDetail";
import { CreateSkillModal } from "../CreateSkillModal";
import { ImportSkillModal } from "../ImportSkillModal";
import { SkillDeleteDialog } from "../SkillDeleteDialog";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsWorkspace({ id, creating }: { id?: string; creating?: boolean }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [query, setQuery] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(!!creating);
  const [deleting, setDeleting] = React.useState<Skill | null>(null);
  React.useEffect(() => setCreateOpen(!!creating), [creating]);
  const closeCreate = () => {
    setCreateOpen(false);
    if (creating) router.push("/skills");
  };

  const list = filterSkills(skills ?? [], query);
  const selected = skills?.find((sk) => sk.id === id);
  const tab = search.get("tab") ?? "config";
  const open = (skillId: string) => router.push(`/skills/${skillId}?tab=${tab}`);

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    ...(creating ? [{ label: t("editor.crumbNew") }] : selected ? [{ label: selected.name }] : []),
  ];

  let detail: React.ReactNode;
  if (id) {
    detail = <SkillDetail id={id} tab={tab} />;
  } else {
    detail = (
      <div style={s.select}>
        <EmptyState icon="Sparkles" title={t("page.selectTitle")} body={t("page.selectBody")} />
      </div>
    );
  }

  return (
    <AppShell crumb={crumb}>
      {createOpen && (
        <CreateSkillModal
          onClose={closeCreate}
          onSaved={(sk) => {
            setCreateOpen(false);
            router.replace(`/skills/${sk.id}`);
          }}
        />
      )}
      {deleting && (
        <SkillDeleteDialog
          skill={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            if (deleting.id === id) router.push("/skills");
          }}
        />
      )}
      {importing && (
        <ImportSkillModal
          onClose={() => setImporting(false)}
          onSaved={(sk) => {
            setImporting(false);
            router.push(`/skills/${sk.id}`);
          }}
        />
      )}
      <div style={s.frame}>
        <aside style={s.list}>
          <div style={s.listHead}>
            <div style={s.listTitleRow}>
              <h1 style={s.h1}>{t("page.listTitle")}</h1>
              <Dropdown
                width={220}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                    {t("page.addSkill")}
                  </Button>
                }
                items={[
                  {
                    label: t("page.menu.create"),
                    icon: "Edit",
                    onClick: () => setCreateOpen(true),
                  },
                  {
                    label: t("page.menu.import"),
                    icon: "Upload",
                    onClick: () => setImporting(true),
                  },
                ]}
              />
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={s.muted} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                aria-label={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>
          <div style={s.cards}>
            {isLoading && (
              <>
                <Skeleton height={110} />
                <Skeleton height={110} />
              </>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {!isLoading && !isError && (skills ?? []).length === 0 && (
              <EmptyState
                icon="Sparkles"
                title={t("page.empty.title")}
                body={t("page.empty.body")}
                cta={t("page.empty.cta")}
                onCta={() => setCreateOpen(true)}
              />
            )}
            {(skills ?? []).length > 0 && list.length === 0 && (
              <p style={s.noMatch}>{t("page.noMatch")}</p>
            )}
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === id}
                onClick={() => open(sk.id)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                onDelete={() => setDeleting(sk)}
              />
            ))}
          </div>
        </aside>
        <main style={s.detail}>{detail}</main>
      </div>
    </AppShell>
  );
}
