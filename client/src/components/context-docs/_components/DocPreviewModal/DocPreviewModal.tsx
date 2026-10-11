/* DocPreviewModal — a document's rendered content without leaving the Context tab
   (AC-19). Markdown without raw HTML, so nothing in the document runs. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Markdown, Modal, Skeleton } from "@devdigest/ui";
import { splitFrontmatter } from "@/lib/frontmatter";
import { useContextDoc } from "@/lib/hooks/context";
import { s } from "../../styles";

export function DocPreviewModal({ repoId, path, onClose }: { repoId: string; path: string; onClose: () => void }) {
  const t = useTranslations("context");
  const { data, isLoading, isError, refetch } = useContextDoc(repoId, path);

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
    <Modal width={900} title={<span className="mono">{path}</span>} onClose={onClose}>
      <div style={s.previewBody}>{body}</div>
    </Modal>
  );
}
