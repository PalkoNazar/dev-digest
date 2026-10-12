/* RunLocallySection — numbered run steps as code, each with a copy control named after its
   command (AC-63, AC-66); a polite live region announces "Copied" (AC-64). Steps the server
   built from repo facts carry a note (AC-82). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { IconBtn } from "@devdigest/ui";
import type { OnboardingTour } from "@devdigest/shared";
import { TourMarkdown } from "../TourMarkdown";
import { COPIED_RESET_MS } from "./constants";
import { s } from "./styles";

type RunLocally = OnboardingTour["sections"]["run_locally"];

/** The copied step, plus a per-copy counter so a repeated copy is announced again. */
type Copied = { index: number; seq: number };

export function RunLocallySection({ section }: { section: RunLocally }) {
  const t = useTranslations("onboarding.runLocally");
  const [copied, setCopied] = React.useState<Copied | null>(null);

  // Clear the "Copied" mark (and the live-region text) after a moment.
  React.useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = (command: string, index: number) => {
    void navigator.clipboard
      ?.writeText(command)
      .then(
        () => setCopied((prev) => ({ index, seq: (prev?.seq ?? 0) + 1 })),
        // a refused clipboard announces nothing (and leaves no unhandled rejection)
        () => setCopied(null),
      );
  };

  return (
    <div style={s.wrap}>
      <TourMarkdown md={section.body_md} />
      {section.steps.length === 0 ? (
        <p style={s.note}>{t("empty")}</p>
      ) : (
        <ol style={s.list}>
          {section.steps.map((step, i) => (
            // Steps have no id and may repeat; the position is their identity here.
            <li key={`${i}-${step.command}`} style={s.row}>
              <span style={s.number} aria-hidden="true">
                {i + 1}
              </span>
              <code className="mono" style={s.command}>
                {step.command}
              </code>
              <IconBtn
                icon={copied?.index === i ? "Check" : "Copy"}
                label={t("copy", { command: step.command })}
                onClick={() => copy(step.command, i)}
              />
            </li>
          ))}
        </ol>
      )}
      {section.source === "deterministic" && <p style={s.note}>{t("deterministic")}</p>}
      <div aria-live="polite" style={s.srOnly}>
        {/* a new key per copy re-inserts the text, so screen readers announce it again */}
        {copied !== null && <span key={copied.seq}>{t("copied")}</span>}
      </div>
    </div>
  );
}
