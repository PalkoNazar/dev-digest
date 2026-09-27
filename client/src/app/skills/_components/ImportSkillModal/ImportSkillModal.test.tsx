import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const PREVIEW: SkillImportPreview = {
  name: "flaky-test-hunter",
  description: "When a diff touches tests, flag flakiness.",
  type: "rubric",
  body: "# Flaky\n\nNo sleeps in tests.",
  source_file: "flaky.zip → flaky-test-hunter/SKILL.md",
  ignored_files: ["flaky-test-hunter/scripts/find-flaky.sh"],
  warnings: ["1 other file(s) in the archive were ignored"],
};
const mutateAsync = vi.fn();
const create = vi.fn();

vi.mock("@/lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutateAsync, isPending: false }),
  useCreateSkill: () => ({ mutate: create, isPending: false }),
}));

import { ImportSkillModal } from "./ImportSkillModal";

function renderModal() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ImportSkillModal onClose={() => {}} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

function upload(name: string, content = "zip-bytes") {
  const file = new File([content], name);
  fireEvent.change(screen.getByTestId("skill-file-input"), { target: { files: [file] } });
}

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue(PREVIEW);
  create.mockReset();
});
afterEach(cleanup);

describe("ImportSkillModal", () => {
  it("starts with the file picker and no save button", () => {
    renderModal();
    expect(screen.getByText("Choose .md or .zip…")).toBeInTheDocument();
    expect(screen.queryByText("Save skill")).not.toBeInTheDocument();
  });

  it("previews the parsed skill before anything is saved", async () => {
    renderModal();
    upload("flaky.zip");
    await screen.findByText("Someone else’s instructions");
    expect(mutateAsync).toHaveBeenCalledWith({
      filename: "flaky.zip",
      content_base64: btoa("zip-bytes"),
    });
    expect(screen.getByText(PREVIEW.source_file)).toBeInTheDocument();
    expect(screen.getByText("flaky-test-hunter/scripts/find-flaky.sh")).toBeInTheDocument();
    expect(screen.getByText("No sleeps in tests.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("saves only on confirm, as an imported skill that starts disabled", async () => {
    renderModal();
    upload("flaky.zip");
    await screen.findByText("Save skill");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "flaky-tests" } });
    fireEvent.click(screen.getByText("Save skill"));
    expect(create).toHaveBeenCalledWith(
      {
        name: "flaky-tests",
        description: PREVIEW.description,
        type: "rubric",
        body: PREVIEW.body,
        enabled: false,
        source: "imported_file",
      },
      expect.any(Object),
    );
  });

  it("blocks saving an invalid name", async () => {
    renderModal();
    upload("flaky.zip");
    await screen.findByText("Save skill");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bad Name" } });
    fireEvent.click(screen.getByText("Save skill"));
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText("Use lowercase letters, digits and dashes (max 64).")).toBeInTheDocument();
  });

  it("rejects other file types without calling the server", async () => {
    renderModal();
    upload("install.sh");
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("shows the server's parse error", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("No SKILL.md (or single .md file) found in the archive"));
    renderModal();
    upload("empty.zip");
    expect(await screen.findByRole("alert")).toHaveTextContent("No SKILL.md");
  });
});
