/* DocPreview — the right pane of the Project Context page: the selected document's
   path, "Used by N agents" (AC-5) and its content as Markdown (AC-3). The Markdown
   renderer has no raw-HTML plugin, so HTML/scripts in a document never run (AC-4). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Icon, Markdown, Skeleton } from "@devdigest/ui";
import type { SpecFile } from "@devdigest/shared";
import { splitFrontmatter } from "@/lib/frontmatter";
import { useContextDoc } from "@/lib/hooks/context";
import { s } from "../../styles";

export function DocPreview({ repoId, doc }: { repoId: string; doc: SpecFile }) {
  const t = useTranslations("context");
  const { data, isLoading, isError, refetch } = useContextDoc(repoId, doc.path);

  let body: React.ReactNode;
  if (isLoading) body = <Skeleton height={160} />;
  else if (isError) body = <ErrorState title={t("preview.loadError")} onRetry={() => refetch()} />;
  else if (!data?.content) body = <span style={s.muted}>{t("preview.empty")}</span>;
  else {
    // A leading YAML frontmatter block is shown as-is in a code block, not parsed as Markdown.
    const { frontmatter, body: markdown } = splitFrontmatter(data.content);
    body = (
      <>
        {frontmatter !== null && (
          <pre className="mono" style={s.frontmatter}>
            {frontmatter}
          </pre>
        )}
        <Markdown>{markdown}</Markdown>
      </>
    );
  }

  return (
    <>
      <div style={s.mainHead}>
        <span className="mono" style={s.mainPath}>
          {doc.path}
        </span>
        <span style={s.usedBy}>
          <Icon.Cpu size={12} />
          {t.rich("usedBy", { count: doc.used_by, b: (c) => <strong>{c}</strong> })}
        </span>
      </div>
      <div style={s.mainBody}>{body}</div>
    </>
  );
}
