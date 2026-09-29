import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import skillsMessages from "../../../../../../../../messages/en/skills.json";
import { countEffective, enabledNeighbour, moveItem, toRows, unattachedSkills } from "./helpers";

const mutate = vi.fn();
const skill = (id: string, name: string, over: Partial<Skill> = {}): Skill => ({
  id,
  name,
  description: `When ${name} applies, flag it.`,
  type: "rubric",
  source: "manual",
  body: "body",
  enabled: true,
  version: 1,
  ...over,
});
const SKILLS: Skill[] = [
  skill("a", "branch-coverage"),
  skill("b", "corner-cases", { type: "convention" }),
  skill("c", "flaky-tests", { enabled: false, source: "imported_file" }),
  skill("d", "unattached"),
];
const link = (skill_id: string, order: number, enabled = true): AgentSkillLink => ({
  agent_id: "ag1",
  skill_id,
  order,
  enabled,
});
let LINKS: AgentSkillLink[] = [];

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false }),
  useAgentSkillLinks: () => ({ data: LINKS, isLoading: false, isError: false }),
  useSetAgentSkillLinks: () => ({ mutate }),
}));

import { SkillsTab } from "./SkillsTab";

const AGENT = { id: "ag1", name: "Test Quality Reviewer" } as Agent;

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, skills: skillsMessages }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mutate.mockClear();
  LINKS = [link("b", 1, false), link("a", 0), link("c", 2)];
});
afterEach(cleanup);

describe("SkillsTab helpers", () => {
  it("joins links with skills in link order and drops unknown ids", () => {
    const rows = toRows([...LINKS, link("zzz", 3)], SKILLS);
    expect(rows.map((r) => [r.skill.name, r.enabled])).toEqual([
      ["branch-coverage", true],
      ["corner-cases", false],
      ["flaky-tests", true],
    ]);
    // flaky-tests is enabled for the agent but off globally → not effective
    expect(countEffective(rows)).toBe(1);
  });

  it("moveItem moves and clamps without mutating", () => {
    const items = ["a", "b", "c"];
    expect(moveItem(items, 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(items, 2, -5)).toEqual(["c", "a", "b"]);
    expect(moveItem(items, 7, 0)).toEqual(items);
    expect(items).toEqual(["a", "b", "c"]);
  });

  it("enabledNeighbour skips rows disabled for the agent", () => {
    const rows = toRows(LINKS, SKILLS); // branch-coverage ✓, corner-cases ✗, flaky-tests ✓
    expect(enabledNeighbour(rows, 0, 1)).toBe(2);
    expect(enabledNeighbour(rows, 2, -1)).toBe(0);
    expect(enabledNeighbour(rows, 0, -1)).toBe(-1);
    expect(unattachedSkills(rows, SKILLS).map((sk) => sk.name)).toEqual(["unattached"]);
  });
});

describe("SkillsTab", () => {
  it("lists every skill: attached ones in order, then the rest", () => {
    renderTab();
    expect(screen.getByText("1 of 4 enabled")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((r) => within(r).getByText(/^(branch|corner|flaky|unattached)/).textContent)).toEqual([
      "branch-coverage",
      "corner-cases",
      "flaky-tests",
      "unattached",
    ]);
    expect(within(rows[2]!).getByText("disabled globally")).toBeInTheDocument();
    expect(within(rows[3]!).getByText("rubric")).toBeInTheDocument();
    expect(within(rows[3]!).queryByLabelText("Detach “unattached”")).not.toBeInTheDocument();
  });

  it("enabling a skill for the agent saves the whole ordered set", () => {
    renderTab();
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    expect(mutate).toHaveBeenCalledWith([
      { skill_id: "a", enabled: true },
      { skill_id: "b", enabled: true },
      { skill_id: "c", enabled: true },
    ]);
  });

  it("enabling an unattached skill attaches it at the end", () => {
    renderTab();
    fireEvent.click(screen.getAllByRole("checkbox")[3]!);
    expect(mutate).toHaveBeenCalledWith([
      { skill_id: "a", enabled: true },
      { skill_id: "b", enabled: false },
      { skill_id: "c", enabled: true },
      { skill_id: "d", enabled: true },
    ]);
  });

  it("only enabled skills can be dragged or moved", () => {
    renderTab();
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((r) => r.getAttribute("draggable"))).toEqual(["true", "false", "true", "false"]);
    expect(screen.queryByLabelText("Move “corner-cases” up")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Move “unattached” up")).not.toBeInTheDocument();
  });

  it("the arrows step over disabled skills; detach removes the link", () => {
    renderTab();
    fireEvent.click(screen.getByLabelText("Move “branch-coverage” down"));
    expect(mutate).toHaveBeenLastCalledWith([
      { skill_id: "b", enabled: false },
      { skill_id: "c", enabled: true },
      { skill_id: "a", enabled: true },
    ]);
    fireEvent.click(screen.getByLabelText("Detach “corner-cases”"));
    expect(mutate).toHaveBeenLastCalledWith([
      { skill_id: "a", enabled: true },
      { skill_id: "c", enabled: true },
    ]);
  });

  it("drag and drop reorders enabled skills", () => {
    renderTab();
    const rows = screen.getAllByRole("listitem");
    fireEvent.dragStart(rows[2]!);
    fireEvent.drop(rows[0]!);
    expect(mutate).toHaveBeenLastCalledWith([
      { skill_id: "c", enabled: true },
      { skill_id: "a", enabled: true },
      { skill_id: "b", enabled: false },
    ]);
  });

  it("moving the first skill up is a no-op", () => {
    renderTab();
    fireEvent.click(screen.getByLabelText("Move “branch-coverage” up"));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("filters by name", () => {
    renderTab();
    fireEvent.change(screen.getByLabelText("Filter skills…"), { target: { value: "corner" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Filter skills…"), { target: { value: "nope" } });
    expect(screen.getByText("No skill matches “nope”.")).toBeInTheDocument();
  });

  it("with nothing attached, every skill is listed unticked", () => {
    LINKS = [];
    renderTab();
    expect(screen.getByText("0 of 4 enabled")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-checked"))).toEqual(["false", "false", "false", "false"]);
  });
});
