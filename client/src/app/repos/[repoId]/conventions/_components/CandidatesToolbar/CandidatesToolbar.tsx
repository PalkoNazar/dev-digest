/* CandidatesToolbar — status filter chips, the tooling-enforced switch,
   "N of M accepted" and Create skill (needs at least one accepted rule). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Chip } from "@devdigest/ui";
import { STATUS_FILTERS } from "../../constants";
import type { CandidateFilter } from "../../helpers";
import { s } from "./styles";

export function CandidatesToolbar({
  filter,
  onFilter,
  accepted,
  total,
  onCreateSkill,
}: {
  filter: CandidateFilter;
  onFilter: (filter: CandidateFilter) => void;
  accepted: number;
  total: number;
  onCreateSkill: () => void;
}) {
  const t = useTranslations("conventions");
  return (
    <div style={s.bar}>
      <div style={s.chips}>
        {STATUS_FILTERS.map((status) => (
          <Chip
            key={status}
            active={filter.status === status}
            onClick={() => onFilter({ ...filter, status })}
          >
            {t(`toolbar.status.${status}`)}
          </Chip>
        ))}
      </div>
      <Checkbox
        checked={filter.showTooling}
        onChange={(showTooling) => onFilter({ ...filter, showTooling })}
        label={t("toolbar.showTooling")}
      />
      <span style={s.count}>{t("toolbar.acceptedCount", { accepted, total })}</span>
      <Button kind="primary" icon="Sparkles" onClick={onCreateSkill} disabled={accepted === 0}>
        {t("toolbar.createSkill")}
      </Button>
    </div>
  );
}
