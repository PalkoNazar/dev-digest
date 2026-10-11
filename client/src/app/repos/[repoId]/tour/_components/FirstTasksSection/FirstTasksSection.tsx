/* FirstTasksSection — the LLM's first-task suggestions as Markdown (AC-90); a skeleton tour
   has none, so it says that tasks need the LLM (AC-45). */
"use client";

import { useTranslations } from "next-intl";
import type { OnboardingTour } from "@devdigest/shared";
import { TourMarkdown } from "../TourMarkdown";
import { s } from "./styles";

type FirstTasks = OnboardingTour["sections"]["first_tasks"];

export function FirstTasksSection({ section }: { section: FirstTasks }) {
  const t = useTranslations("onboarding.firstTasks");
  if (!section.body_md) return <p style={s.note}>{t("needsLlm")}</p>;
  return (
    <div style={s.wrap}>
      <TourMarkdown md={section.body_md} />
    </div>
  );
}
