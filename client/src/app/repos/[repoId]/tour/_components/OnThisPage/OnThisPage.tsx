/* OnThisPage — one entry per tour section (AC-7). Activating one scrolls to the section
   and moves keyboard focus to its heading (AC-8). */
"use client";

import { useTranslations } from "next-intl";
import { ONBOARDING_SECTION_IDS, type OnboardingSectionId } from "@devdigest/shared";
import { sectionHeadingId } from "../../helpers";
import { s } from "./styles";

const LABEL_ID = "tour-on-this-page";

function goTo(id: OnboardingSectionId) {
  const heading = document.getElementById(sectionHeadingId(id));
  if (!heading) return;
  heading.scrollIntoView({ behavior: "smooth", block: "start" });
  heading.focus({ preventScroll: true });
}

export function OnThisPage() {
  const t = useTranslations("onboarding");
  return (
    <nav aria-labelledby={LABEL_ID} style={s.nav}>
      <div id={LABEL_ID} style={s.label}>
        {t("onThisPage")}
      </div>
      <ul style={s.list}>
        {ONBOARDING_SECTION_IDS.map((id) => (
          <li key={id}>
            <button type="button" onClick={() => goTo(id)} style={s.entry}>
              {t(`sections.${id}`)}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
