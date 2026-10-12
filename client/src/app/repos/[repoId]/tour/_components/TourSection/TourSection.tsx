/* TourSection — one tour section: a labelled region with an h2 (the On this page focus
   target, AC-8) and a keyboard-reachable collapse toggle (AC-9). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingSectionId } from "@devdigest/shared";
import { SECTION_ICONS } from "../../constants";
import { sectionBodyId, sectionHeadingId } from "../../helpers";
import { s } from "./styles";

export function TourSection({ id, children }: { id: OnboardingSectionId; children: React.ReactNode }) {
  const t = useTranslations("onboarding");
  const [open, setOpen] = React.useState(true);
  const title = t(`sections.${id}`);
  const headingId = sectionHeadingId(id);
  const bodyId = sectionBodyId(id);
  const SectionIcon = Icon[SECTION_ICONS[id]];

  return (
    <section aria-labelledby={headingId} style={s.card}>
      <div style={s.head}>
        <span style={s.icon} aria-hidden="true">
          <SectionIcon size={16} />
        </span>
        <h2 id={headingId} tabIndex={-1} style={s.title}>
          {title}
        </h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={t(open ? "actions.collapse" : "actions.expand", { section: title })}
          onClick={() => setOpen((o) => !o)}
          style={s.toggle}
        >
          <Icon.ChevronDown size={16} style={open ? s.chevronOpen : undefined} />
        </button>
      </div>
      {/* No `display` in the body style: it would override the `hidden` attribute. */}
      <div id={bodyId} hidden={!open} style={s.body}>
        {children}
      </div>
    </section>
  );
}
