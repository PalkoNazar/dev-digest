/* BlastSymbolImpact — one changed symbol in the blast radius: a collapsible header
   (symbol + caller count), its callers as `file:line` links to GitHub, then the
   endpoints and cron jobs that may break, each in its own row of chips. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { DownstreamImpact } from "@devdigest/shared";
import { callerHref } from "./helpers";
import { s } from "./styles";

interface BlastSymbolImpactProps {
  impact: DownstreamImpact;
  /** Display name, e.g. `buildPrompt()` for a function. */
  label: string;
  linkSha: string | null;
  repoFullName: string | null;
  defaultOpen?: boolean;
}

export function BlastSymbolImpact({
  impact,
  label,
  linkSha,
  repoFullName,
  defaultOpen = false,
}: BlastSymbolImpactProps) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(defaultOpen);
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;

  return (
    <div style={s.item}>
      <button
        type="button"
        style={s.header}
        aria-expanded={open}
        title={t(open ? "collapse" : "expand", { symbol: impact.symbol })}
        onClick={() => setOpen((o) => !o)}
      >
        <Chevron size={14} style={s.chevron} />
        <span className="mono" style={s.symbol}>
          {label}
        </span>
        <span style={s.count}>{t("callerCount", { count: impact.callers.length })}</span>
      </button>

      {open && (
        <div style={s.body}>
          <ul style={s.callers} aria-label={t("section.callers")}>
            {impact.callers.map((caller) => {
              const location = `${caller.file}:${caller.line}`;
              const href = callerHref(repoFullName, linkSha, caller);
              return (
                <li key={`${location}:${caller.name}`} style={s.caller}>
                  <span style={s.arrow} aria-hidden>
                    ↳
                  </span>
                  {href ? (
                    <a
                      className="mono"
                      style={s.link}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t("openOnGithub", { location })}
                    >
                      {location}
                    </a>
                  ) : (
                    <span className="mono" style={s.location}>
                      {location}
                    </span>
                  )}
                  <span className="mono" style={s.callerName}>
                    {caller.name}
                  </span>
                </li>
              );
            })}
          </ul>

          {impact.endpoints_affected.length > 0 && (
            <div style={s.chipsBlock}>
              <div style={s.chipsLabel}>{t("section.endpoints")}</div>
              <div style={s.chips}>
                {impact.endpoints_affected.map((endpoint) => (
                  <Badge key={endpoint} mono icon="Globe" color="var(--accent)" bg="var(--accent-bg)">
                    {endpoint}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {impact.crons_affected.length > 0 && (
            <div style={s.chipsBlock}>
              <div style={s.chipsLabel}>{t("section.crons")}</div>
              <div style={s.chips}>
                {impact.crons_affected.map((cron) => (
                  <Badge key={cron} mono icon="Clock" color="var(--warn)" bg="var(--warn-bg)">
                    {cron}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
