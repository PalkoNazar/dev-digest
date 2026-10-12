/* CriticalPathsSection — up to five import chains (AC-29): the root file as path text (no
   Open action, AC-65), the rest of the chain, the number of indexed importers when the
   index gives it (AC-70) and the LLM's description (AC-76). Empty → a plain note (AC-30). */
"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingTour } from "@devdigest/shared";
import { PathText } from "../PathText";
import { TourMarkdown } from "../TourMarkdown";
import { s } from "./styles";

type CriticalPaths = OnboardingTour["sections"]["critical_paths"];

export function CriticalPathsSection({ section }: { section: CriticalPaths }) {
  const t = useTranslations("onboarding.criticalPaths");
  return (
    <div style={s.wrap}>
      <TourMarkdown md={section.body_md} />
      {section.entries.length === 0 ? (
        <p style={s.empty}>{t("empty")}</p>
      ) : (
        <ul style={s.list}>
          {section.entries.map((entry) => (
            <li key={entry.root} style={s.row}>
              <Icon.FileText size={15} style={s.fileIcon} aria-hidden="true" />
              <div style={s.main}>
                <div style={s.line}>
                  <PathText path={entry.root} />
                  {entry.importers !== null && (
                    <span style={s.importers}>
                      {t.rich("importers", { count: entry.importers, b: (c) => <strong>{c}</strong> })}
                    </span>
                  )}
                </div>
                {entry.chain.length > 0 && (
                  <div style={s.chain}>
                    {entry.chain.map((step, i) => (
                      <span key={`${i}-${step}`} style={s.chainStep}>
                        <span aria-hidden="true">→</span>
                        <PathText path={step} />
                      </span>
                    ))}
                  </div>
                )}
                {entry.description && <div style={s.description}>{entry.description}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
