import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";
import { filterSkills } from "./helpers";

const push = vi.fn();
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
  it("empty workspace: the CTA goes to /skills/new", () => {
    SKILLS = [];
    renderWs();
    fireEvent.click(screen.getByRole("button", { name: /Create skill/ }));
    expect(push).toHaveBeenCalledWith("/skills/new");
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

  it("renders the selected skill, or the new-skill form", () => {
    renderWs({ id: "a" });
    expect(screen.getByText("detail:a")).toBeInTheDocument();
    cleanup();
    renderWs({ creating: true });
    expect(screen.getByText("New skill")).toBeInTheDocument();
  });

  it("Add skill → Import opens the import modal", () => {
    renderWs();
    fireEvent.click(screen.getByRole("button", { name: /Add skill/ }));
    fireEvent.click(screen.getByText("Import from file…"));
    expect(screen.getByText("import-modal")).toBeInTheDocument();
  });
});
