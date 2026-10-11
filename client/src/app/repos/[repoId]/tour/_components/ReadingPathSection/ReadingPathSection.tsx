/* ReadingPathSection — the files to read first, in the server's import-graph rank order
   (AC-25) with the note that says so (AC-89), each with the LLM's reason when there is one. */
"use client";

import { useTranslations } from "next-intl";
import type { OnboardingTour } from "@devdigest/shared";
import { PathText } from "../PathText";
import { TourMarkdown } from "../TourMarkdown";
import { s } from "./styles";

type ReadingPath = OnboardingTour["sections"]["reading_path"];

export function ReadingPathSection({ section }: { section: ReadingPath }) {
  const t = useTranslations("onboarding.readingPath");
  return (
    <div style={s.wrap}>
      <p style={s.note}>{t("note")}</p>
      <TourMarkdown md={section.body_md} />
      {section.items.length === 0 ? (
        <p style={s.note}>{t("empty")}</p>
      ) : (
        <ol style={s.list}>
          {section.items.map((item, i) => (
            <li key={item.path} style={s.item}>
              <span style={s.number} aria-hidden="true">
                {i + 1}
              </span>
              <div style={s.main}>
                <PathText path={item.path} />
                {item.reason && <div style={s.reason}>{item.reason}</div>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
