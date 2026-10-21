import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, SmartDiffRole } from "@devdigest/shared";
import prReview from "../../../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../../../messages/en/shell.json";
import type { DiffFocus } from "@/components/diff-viewer";
import { stubScrollIntoView } from "@/test/scroll-into-view";
import { RoleGroup } from "./RoleGroup";

afterEach(cleanup);

const file = (path: string): PrFile => ({ path, additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n a\n+b" });

function renderGroup(role: SmartDiffRole, files: PrFile[], filesWithFindings = 0) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <RoleGroup role={role} files={files} filesWithFindings={filesWithFindings} />
    </NextIntlClientProvider>,
  );
}

describe("RoleGroup", () => {
  it("core: label, hint, file count, ● N and open by default", () => {
    renderGroup("core", [file("src/a.ts"), file("src/b.ts")], 2);
    const header = screen.getByRole("button", { expanded: true });
    expect(header).toHaveTextContent("Core");
    expect(header).toHaveTextContent("The change itself — read first");
    expect(header).toHaveTextContent("2 files");
    expect(screen.getByLabelText("2 files with findings")).toHaveTextContent("● 2");
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
  });

  it("docs: collapsed by default, no ● for 0, click expands", () => {
    renderGroup("docs", [file("README.md")], 0);
    expect(screen.getByRole("button", { expanded: false })).toHaveTextContent("Docs");
    expect(screen.queryByText(/●/)).not.toBeInTheDocument();
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Docs/ }));
    expect(screen.getByText("README.md")).toBeInTheDocument();
  });
});

/* L05 S11 — a focus target forces its role group open; RoleGroup passes the full
   focus down to its own DiffViewer (it never scrolls itself — FileCard does). */
describe("RoleGroup focus target", () => {
  let scroll: ReturnType<typeof stubScrollIntoView>;
  beforeEach(() => {
    scroll = stubScrollIntoView();
  });
  afterEach(() => {
    scroll.restore();
  });

  const renderFocused = (role: SmartDiffRole, files: PrFile[], focus: DiffFocus | null) =>
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
        <RoleGroup role={role} files={files} filesWithFindings={0} focus={focus} />
      </NextIntlClientProvider>,
    );

  it("a docs group (collapsed by default) holding the focused file opens", () => {
    renderFocused("docs", [file("README.md"), file("docs/guide.md")], { path: "docs/guide.md", line: 2 });
    expect(screen.getByRole("button", { name: /Docs/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("docs/guide.md")).toBeInTheDocument();
  });

  it("a docs group without the focused file stays collapsed", () => {
    renderFocused("docs", [file("README.md")], { path: "src/a.ts", line: 2 });
    expect(screen.getByRole("button", { name: /Docs/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();
  });
});
