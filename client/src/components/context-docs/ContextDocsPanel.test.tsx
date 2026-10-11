import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextAttachments } from "@devdigest/shared";
import messages from "../../../messages/en/context.json";

/* L05 S10 — shared Context-tab document list (AC-11, AC-18, AC-19, AC-21, AC-26,
   AC-28, AC-29, AC-42, AC-43, AC-46). */

vi.mock("@/lib/hooks/context", () => ({
  useContextDoc: (_repoId: string, path: string) => ({
    data: { path, category: "x", size: 1, tokens: 1, used_by: 0, content: `# Preview of ${path}` },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { ContextDocsPanel } from "./ContextDocsPanel";

const VIEW: ContextAttachments = {
  repo_id: "11111111-1111-4111-8111-111111111111",
  rows: [
    { path: "specs/a.md", category: "specs", tokens: 120, state: "attached", via: ["Rubric"] },
    { path: "specs/gone.md", category: "specs", tokens: 0, state: "missing", via: [] },
    { path: "docs/b.md", category: "docs", tokens: 80, state: "attached", via: [] },
    { path: "docs/inherited.md", category: "docs", tokens: 40, state: "inherited", via: ["Security"] },
    { path: "README.md", category: "root", tokens: 30, state: "available", via: [] },
  ],
  attached: 3,
  total: 5,
  tokens: 240,
};

function renderPanel(pending = false) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextDocsPanel repoId={VIEW.repo_id} view={VIEW} pending={pending} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

afterEach(cleanup);

describe("ContextDocsPanel", () => {
  it("renders one row per document; inherited rows have no checkbox and say 'via'", () => {
    renderPanel();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    // Checkboxes only on attached + available rows, named by the full path.
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    expect(screen.getByRole("checkbox", { name: "specs/a.md" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("checkbox", { name: "docs/inherited.md" })).not.toBeInTheDocument();
    expect(screen.getByText("via Security")).toBeInTheDocument();
    expect(screen.getByText("also via Rubric")).toBeInTheDocument();
    expect(screen.getByText("≈ 120 tok")).toBeInTheDocument();
    expect(screen.getByText("specs/a.md")).toHaveAttribute("title", "specs/a.md");
  });

  it("ticking an available row appends it; detach and move send the new own order", () => {
    const onChange = renderPanel();
    fireEvent.click(screen.getByRole("checkbox", { name: "README.md" }));
    expect(onChange).toHaveBeenLastCalledWith(["specs/a.md", "specs/gone.md", "docs/b.md", "README.md"]);

    fireEvent.click(screen.getByRole("button", { name: "Detach specs/gone.md" }));
    expect(onChange).toHaveBeenLastCalledWith(["specs/a.md", "docs/b.md"]);

    fireEvent.click(screen.getByRole("button", { name: "Move specs/a.md down" }));
    expect(onChange).toHaveBeenLastCalledWith(["specs/gone.md", "specs/a.md", "docs/b.md"]);

    expect(screen.getByRole("button", { name: "Move specs/a.md up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move docs/b.md down" })).toBeDisabled();
  });

  it("filters by path and previews a document in a modal", () => {
    renderPanel();
    fireEvent.change(screen.getByRole("textbox", { name: "Filter documents…" }), { target: { value: "DOCS/" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Preview docs/b.md" }));
    expect(screen.getByRole("heading", { name: "Preview of docs/b.md" })).toBeInTheDocument();
  });

  it("disables the list controls while a save is pending", () => {
    const onChange = renderPanel(true);
    expect(screen.getByRole("button", { name: "Detach specs/gone.md" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "README.md" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
