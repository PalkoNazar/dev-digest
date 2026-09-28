import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate, Skill } from "@devdigest/shared";
import conventions from "../../../../../../../messages/en/conventions.json";
import skillsMessages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const create = vi.fn();
const update = vi.fn();
const link = vi.fn();
const patchConvention = vi.fn();
let skills: Skill[] = [];

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: skills }),
  useCreateSkill: () => ({ mutateAsync: create }),
  useUpdateSkill: () => ({ mutateAsync: update }),
  useLinkSkillToAgent: () => ({ mutateAsync: link }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "a1", name: "Test Quality Reviewer" }, { id: "a2", name: "Security" }] }),
}));
vi.mock("@/lib/hooks/conventions", () => ({
  useUpdateConvention: () => ({ mutateAsync: patchConvention }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

const ACCEPTED: ConventionCandidate[] = [
  {
    id: "c1",
    category: "error-handling",
    rule: "Throw NotFoundError for a missing entity",
    evidence: [{ path: "src/a.ts", line_start: 3, line_end: 3, snippet: "throw new NotFoundError('x');" }],
    confidence: 0.9,
    status: "accepted",
    edited: false,
    created_at: "",
  },
];

const SAVED: Skill = {
  id: "s1",
  name: "payments-api-conventions",
  description: "d",
  type: "convention",
  source: "extracted",
  body: "b",
  enabled: true,
  version: 1,
};

function renderModal(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions, skills: skillsMessages }}>
      <ToastProvider>
        <CreateSkillModal repoId="r1" repoFullName="acme/payments-api" accepted={ACCEPTED} onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return onClose;
}

beforeEach(() => {
  skills = [];
  for (const fn of [create, update, link, patchConvention]) fn.mockReset();
  create.mockResolvedValue(SAVED);
  update.mockResolvedValue({ ...SAVED, version: 2 });
  link.mockResolvedValue([]);
  patchConvention.mockResolvedValue({});
});
afterEach(cleanup);

describe("CreateSkillModal", () => {
  it("prefills name, description and a body merged from the accepted conventions", () => {
    renderModal();
    expect(screen.getByLabelText("Name")).toHaveValue("payments-api-conventions");
    expect(screen.getByLabelText("Description")).toHaveValue("1 house convention extracted from acme/payments-api");
    expect((screen.getAllByRole("textbox").at(-1) as HTMLTextAreaElement).value).toContain(
      "## 1. Throw NotFoundError for a missing entity",
    );
  });

  it("creates an extracted convention skill, links chosen agents and marks the conventions", async () => {
    const onClose = renderModal();
    fireEvent.click(screen.getByText("Test Quality Reviewer"));
    fireEvent.click(screen.getByRole("button", { name: /Create skill/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "payments-api-conventions",
        type: "convention",
        source: "extracted",
        enabled: true,
      }),
    );
    expect(link).toHaveBeenCalledWith({ agentId: "a1", skillId: "s1" });
    expect(link).toHaveBeenCalledTimes(1);
    expect(patchConvention).toHaveBeenCalledWith({ id: "c1", patch: { skill_id: "s1" } });
  });

  it("updates the skill when the name already exists", async () => {
    skills = [{ ...SAVED, version: 1 }];
    const onClose = renderModal();
    expect(screen.getByText(/saving updates it to v2/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Update skill/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ id: "s1", patch: expect.objectContaining({ type: "convention" }) });
  });

  it("does not save an invalid name, and stays open when saving fails", async () => {
    const onClose = renderModal();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Not A Slug" } });
    fireEvent.click(screen.getByRole("button", { name: /Create skill/ }));
    expect(screen.getByText(/Lowercase letters/)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "ok-name" } });
    create.mockRejectedValueOnce(new Error("boom"));
    fireEvent.click(screen.getByRole("button", { name: /Create skill/ }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});
