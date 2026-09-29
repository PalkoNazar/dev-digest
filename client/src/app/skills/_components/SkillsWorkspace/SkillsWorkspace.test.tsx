import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";
import { filterSkills } from "./helpers";

const push = vi.fn();
const deleteMutate = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("tab=versions"),
}));
// The shell (sidebar, repo switcher) is not what this test is about.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../SkillDetail", () => ({ SkillDetail: ({ id }: { id: string }) => <div>detail:{id}</div> }));
vi.mock("../ImportSkillModal", () => ({ ImportSkillModal: () => <div>import-modal</div> }));

let SKILLS: Skill[] = [];
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false }),
  useUpdateSkill: () => ({ mutate: vi.fn() }),
  useCreateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
}));

import { SkillsWorkspace } from "./SkillsWorkspace";

const skill = (id: string, name: string, type: Skill["type"] = "rubric"): Skill => ({
  id,
  name,
  description: `When ${name} applies, flag it.`,
  type,
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
  agent_count: 0,
});

function renderWs(props: { id?: string; creating?: boolean } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <SkillsWorkspace {...props} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  push.mockClear();
  deleteMutate.mockReset();
  SKILLS = [skill("a", "branch-coverage"), skill("b", "no-then-chains", "convention")];
});
afterEach(cleanup);

describe("filterSkills", () => {
  it("matches name, type and description, case-insensitively", () => {
    expect(filterSkills(SKILLS, "  CONVENTION ").map((s) => s.id)).toEqual(["b"]);
    expect(filterSkills(SKILLS, "")).toHaveLength(2);
    expect(filterSkills(SKILLS, "nope")).toEqual([]);
  });
});

describe("SkillsWorkspace", () => {
  it("empty workspace: the CTA opens the create modal", () => {
    SKILLS = [];
    renderWs();
    fireEvent.click(screen.getByRole("button", { name: /Create skill/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("New skill");
    expect(push).not.toHaveBeenCalled();
  });

  it("Add skill → Create opens the form in a modal: name, description, type, body", () => {
    renderWs();
    fireEvent.click(screen.getByRole("button", { name: /Add skill/ }));
    fireEvent.click(screen.getByText("Create skill"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Name");
    expect(dialog).toHaveTextContent("Description");
    expect(dialog).toHaveTextContent("Type");
    expect(dialog).toHaveTextContent("Skill body");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a card shows its version and agent count; its Delete asks in a modal", () => {
    SKILLS = [{ ...skill("a", "branch-coverage"), version: 3, agent_count: 2 }];
    renderWs();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Delete skill “branch-coverage”"));
    expect(screen.getByRole("dialog")).toHaveTextContent("Delete skill?");
    expect(push).not.toHaveBeenCalled(); // the click did not open the card
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteMutate).toHaveBeenCalledWith("a", expect.anything());
  });

  it("no selection shows the prompt; a card opens its skill keeping the current tab", () => {
    renderWs();
    expect(screen.getByText("Select a skill")).toBeInTheDocument();
    fireEvent.click(screen.getByText("no-then-chains"));
    expect(push).toHaveBeenCalledWith("/skills/b?tab=versions");
  });

  it("search filters the list", () => {
    renderWs();
    fireEvent.change(screen.getByLabelText("Search skills…"), { target: { value: "branch" } });
    expect(screen.getByText("branch-coverage")).toBeInTheDocument();
    expect(screen.queryByText("no-then-chains")).not.toBeInTheDocument();
  });

  it("renders the selected skill; /skills/new opens the create modal", () => {
    renderWs({ id: "a" });
    expect(screen.getByText("detail:a")).toBeInTheDocument();
    cleanup();
    renderWs({ creating: true });
    expect(screen.getByRole("dialog")).toHaveTextContent("New skill");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(push).toHaveBeenCalledWith("/skills");
  });

  it("Add skill → Import opens the import modal", () => {
    renderWs();
    fireEvent.click(screen.getByRole("button", { name: /Add skill/ }));
    fireEvent.click(screen.getByText("Import from file…"));
    expect(screen.getByText("import-modal")).toBeInTheDocument();
  });
});

describe("SkillCard accessibility", () => {
  it("exposes one open button and a separate switch per card, not nested controls", () => {
    SKILLS = [skill("a", "branch-coverage")];
    renderWs({ id: "a" });
    const open = screen.getByRole("button", { name: "branch-coverage" });
    const toggle = screen.getByRole("switch");
    expect(open).toHaveAttribute("aria-current", "true");
    expect(open.contains(toggle)).toBe(false);
    expect(toggle.closest("[role='button']")).toBeNull();
    fireEvent.click(open);
    expect(push).toHaveBeenCalledWith("/skills/a?tab=versions");
  });
});
