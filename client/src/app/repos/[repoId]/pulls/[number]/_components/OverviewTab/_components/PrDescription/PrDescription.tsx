/* PrDescription — the PR body on the Overview tab, rendered as GitHub-flavoured Markdown
   (headings, lists, tables, code). The Markdown renderer has no raw-HTML plugin, so HTML
   in a PR body is never executed. */
"use client";

import React from "react";
import { Markdown, SectionLabel } from "@devdigest/ui";
import { s } from "./styles";

export function PrDescription({ body }: { body: string }) {
  return (
    <section>
      <SectionLabel icon="MessageSquare">Description</SectionLabel>
      <div style={s.descriptionBox}>
        <Markdown variant="document">{body}</Markdown>
      </div>
    </section>
  );
}
