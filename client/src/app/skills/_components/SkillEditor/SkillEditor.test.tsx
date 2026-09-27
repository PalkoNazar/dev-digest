import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";
import { validateSkillDraft } from "../../helpers";

const create = vi.fn();
const update = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: create, isPending: false }),
  useUpdateSkill: () => ({ mutate: update, isPending: false }),
}));

import { SkillEditor } from "./SkillEditor";

const SKILL: Skill = {
  id: "s1",
  name: "branch-coverage",
  description: "When a diff adds a branch, flag it if no test covers it.",
  type: "rubric",
  source: "manual",
  body: "# Rule\nEvery new branch needs a test.",
  enabled: true,
  version: 3,
};

function renderEditor(skill?: Skill) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <SkillEditor skill={skill} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  create.mockReset();
  update.mockReset();
});
afterEach(cleanup);

describe("validateSkillDraft", () => {
  it("uses the shared contract's rules", () => {
    expect(validateSkillDraft({ ...SKILL })).toEqual({});
    const errors = validateSkillDraft({ ...SKILL, name: "No Spaces", description: " ", body: "" });
    expect(Object.keys(errors).sort()).toEqual(["body", "description", "name"]);
  });
});

describe("SkillEditor", () => {
  it("hints that the description is a directive", () => {
    renderEditor();
    expect(screen.getByText(/write it as a directive/)).toBeInTheDocument();
  });

  it("does not create an invalid skill and shows why", () => {
    renderEditor();
    fireEvent.click(screen.getByText("Create skill"));
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText("Use lowercase letters, digits and dashes (max 64).")).toBeInTheDocument();
  });

  it("creates a skill from the form", () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "corner-cases" } });
    fireEvent.change(screen.getByPlaceholderText("When … , flag … / check …"), {
      target: { value: "When a function takes numbers, check 0, negatives and limits." },
    });
    fireEvent.change(screen.getByPlaceholderText(/# Rule/), { target: { value: "- 0\n- -1" } });
    fireEvent.click(screen.getByText("Create skill"));
    expect(create).toHaveBeenCalledWith(
      {
        name: "corner-cases",
        description: "When a function takes numbers, check 0, negatives and limits.",
        type: "rubric",
        body: "- 0\n- -1",
        enabled: true,
      },
      expect.any(Object),
    );
  });

  it("edits an existing skill and previews the markdown body", () => {
    renderEditor(SKILL);
    expect(screen.getByText("v3")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Preview"));
    expect(screen.getByText("Every new branch needs a test.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Save skill"));
    expect(update).toHaveBeenCalledWith(
      {
        id: "s1",
        patch: {
          name: SKILL.name,
          description: SKILL.description,
          type: "rubric",
          body: SKILL.body,
          enabled: true,
        },
      },
      expect.any(Object),
    );
  });
});
