import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillStats } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

let STATS: SkillStats;
vi.mock("@/lib/hooks/skills", () => ({
  useSkillStats: () => ({ data: STATS, isLoading: false, isError: false }),
}));

import { SkillStatsTab } from "./SkillStatsTab";

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillStatsTab skillId="s1" />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("SkillStatsTab", () => {
  it("renders the tiles, the agents with Open links and the category legend", () => {
    STATS = {
      window_days: 30,
      agents: [
        { id: "a1", name: "Test Quality Reviewer", link_enabled: true, agent_enabled: true },
        { id: "a2", name: "Security Reviewer", link_enabled: false, agent_enabled: true },
      ],
      runs_total: 7,
      runs_with_skill: 5,
      pull_rate: 5 / 7,
      findings: 6,
      accepted: 3,
      dismissed: 1,
      accept_rate: 0.75,
      by_category: [
        { category: "test", count: 4 },
        { category: "bug", count: 2 },
      ],
    };
    renderTab();
    expect(screen.getByText("agents")).toBeInTheDocument();
    expect(screen.getByText("71")).toBeInTheDocument();
    expect(screen.getByText("5 of 7 runs of these agents had the skill in the prompt")).toBeInTheDocument();
    // the tile value and the CircularScore ring
    expect(screen.getAllByText("75")).toHaveLength(2);
    expect(screen.getByText("FINDINGS (30D)")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getAllByText("Open")[0]!.closest("a")).toHaveAttribute("href", "/agents/a1?tab=skills");
    expect(screen.getByText("off for this agent")).toBeInTheDocument();
    expect(screen.getByText("test")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("shows dashes and empty states without data instead of 0%", () => {
    STATS = {
      window_days: 30,
      agents: [],
      runs_total: 0,
      runs_with_skill: 0,
      pull_rate: null,
      findings: 0,
      accepted: 0,
      dismissed: 0,
      accept_rate: null,
      by_category: [],
    };
    renderTab();
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("Not attached to any agent yet.")).toBeInTheDocument();
    expect(screen.getByText("No findings in runs with this skill yet.")).toBeInTheDocument();
  });
});
