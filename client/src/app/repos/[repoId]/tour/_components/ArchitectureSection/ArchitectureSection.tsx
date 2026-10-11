/* ArchitectureSection — the overview text, an optional diagram (strict Mermaid, AC-37/38),
   then the detected stack and the top-level folders with their indexed-file counts (AC-45). */
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { OnboardingTour } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { PathText } from "../PathText";
import { TourMarkdown } from "../TourMarkdown";
import { s } from "./styles";

type Architecture = OnboardingTour["sections"]["architecture"];

export function ArchitectureSection({ section }: { section: Architecture }) {
  const t = useTranslations("onboarding.architecture");
  return (
    <div style={s.wrap}>
      <TourMarkdown md={section.body_md} />
      {section.diagram && <MermaidDiagram chart={section.diagram} />}
      {section.stack.length > 0 && (
        <div>
          <h3 style={s.subhead}>{t("stack")}</h3>
          <div style={s.stack}>
            {section.stack.map((item) => (
              <Badge key={item}>{item}</Badge>
            ))}
          </div>
        </div>
      )}
      {section.folders.length > 0 && (
        <div>
          <h3 style={s.subhead}>{t("folders")}</h3>
          <ul style={s.folders}>
            {section.folders.map((folder) => (
              <li key={folder.path} style={s.folder}>
                <PathText path={folder.path} />
                <span style={s.count}>{t("folderFiles", { count: folder.files })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
