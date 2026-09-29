import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const replace = vi.fn();
const push = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push }) }));

let SKILL: Skill;
const VERSIONS: SkillVersion[] = [
  { version: 2, body: "# New rule", created_at: "2026-09-27T20:00:00Z" },
  { version: 1, body: "# Old rule", created_at: "2026-09-27T19:00:00Z" },
];
vi.mock("@/lib/hooks/skills", () => ({
  useSkill: () => ({ data: SKILL, isLoading: false, isError: false }),
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false, isError: false }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
  useCreateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
}));

import { SkillDetail } from "./SkillDetail";

function renderDetail(tab: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <SkillDetail id="s1" tab={tab} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  replace.mockClear();
  push.mockClear();
  updateMutate.mockReset();
  deleteMutate.mockReset();
  SKILL = {
    id: "s1",
    name: "flaky-test-hunter",
    description: "When tests change, flag flakiness.",
    type: "rubric",
    source: "imported_file",
    body: "# New rule",
    enabled: false,
    version: 2,
    agent_count: 1,
  };
});
afterEach(cleanup);

describe("SkillDetail", () => {
  it("shows the header with version and the needs-vetting badge for a disabled import", () => {
    renderDetail("config");
    expect(screen.getByRole("heading", { name: "flaky-test-hunter" })).toBeInTheDocument();
    expect(screen.getAllByText("v2").length).toBeGreaterThan(0);
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
  });

  it("the Config tab shows the file bar with a token estimate and marks unsaved edits", () => {
    renderDetail("config");
    expect(screen.getByText("flaky-test-hunter.md")).toBeInTheDocument();
    expect(screen.getByText("≈3 tokens")).toBeInTheDocument();
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("# New rule"), { target: { value: "# Changed" } });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
  });

  it("switching tabs goes through the URL", () => {
    renderDetail("config");
    fireEvent.click(screen.getByText("Versions"));
    expect(replace).toHaveBeenCalledWith("/skills/s1?tab=versions");
  });

  it("the Versions tab lists history newest first and marks the current one", () => {
    renderDetail("versions");
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("v2");
    expect(items[0]).toHaveTextContent("current");
    fireEvent.click(screen.getByText("v1"));
    expect(screen.getByText("# Old rule")).toBeInTheDocument();
  });

  it("Diff on an older version shows what changed against the current body", () => {
    renderDetail("versions");
    // only older versions get Diff / Restore
    expect(screen.getAllByRole("button", { name: /Diff/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Diff/ }));
    expect(screen.getByText("Changes from v1 to the current v2 (− removed, + added)")).toBeInTheDocument();
    expect(screen.getByText("- # Old rule")).toBeInTheDocument();
    expect(screen.getByText("+ # New rule")).toBeInTheDocument();
  });

  it("Restore saves the old body as a new version", () => {
    renderDetail("versions");
    fireEvent.click(screen.getByRole("button", { name: /Restore/ }));
    expect(updateMutate).toHaveBeenCalledWith(
      { id: "s1", patch: { body: "# Old rule" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("Delete asks in a modal: cancel keeps the skill, confirm deletes it", () => {
    renderDetail("config");
    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Delete skill “flaky-test-hunter”?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(deleteMutate).toHaveBeenCalledWith("s1", expect.anything());
  });

  it("the Preview tab renders the body with the trust notice for imports", () => {
    renderDetail("preview");
    expect(screen.getByText(/someone else’s instructions/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "New rule" })).toBeInTheDocument();
  });
});
