import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SpecFile } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/context.json";

/* L05 manual-check fixes — frontmatter preview (AC-3) and middle-cut list paths (AC-43). */

const docsState: { data?: SpecFile[]; isLoading: boolean; isError: boolean } = {
  data: undefined,
  isLoading: false,
  isError: false,
};
const refetch = vi.fn();
const docContent = vi.fn<(path: string) => string | null>();

vi.mock("@/lib/hooks/context", () => ({
  useContextDocs: () => ({ ...docsState, refetch }),
  useInvalidateRepoDocs: () => vi.fn(),
  useContextDoc: (_repoId: string, path: string) => ({
    data: { path, category: "x", size: 1, tokens: 1, used_by: 0, content: docContent(path) },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks/repo-intel", () => ({
  useRepoIntelStatus: () => ({ data: { updatedAt: new Date(0).toISOString() } }),
  useResyncRepoIntel: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repos: [{ id: "r1", full_name: "acme/api" }] }),
  useRepoNotFound: () => false,
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { ProjectContextView } from "./ProjectContextView";

const doc = (path: string, category: string, used_by = 0): SpecFile => ({
  path,
  category,
  size: 100,
  tokens: 25,
  used_by,
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ProjectContextView repoId="r1" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  Object.assign(docsState, { data: undefined, isLoading: false, isError: false });
  refetch.mockReset();
  docContent.mockReset();
  docContent.mockReturnValue("# Title");
});
afterEach(cleanup);

describe("ProjectContextView display", () => {
  it("shows a leading frontmatter block as a code block above the Markdown body (AC-3)", () => {
    docsState.data = [doc("skills/x.md", "skills")];
    docContent.mockReturnValue("---\nname: x\nskills:\n  - zod\n---\n# Body title\n\nText");
    const { container } = renderView();

    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toBe("name: x\nskills:\n  - zod");
    expect(screen.getByRole("heading", { name: "Body title" })).toBeInTheDocument();
    // The frontmatter is not parsed as Markdown: no rule, no "skills:" heading.
    expect(container.querySelector("hr")).toBeNull();
    expect(screen.queryByRole("heading", { name: /skills/ })).not.toBeInTheDocument();
  });

  it("cuts a long list path in the middle; the full path stays the title and accessible name (AC-43)", () => {
    const long = ".claude/skills/drizzle-orm-patterns/references/relations.md";
    docsState.data = [doc(long, "skills")];
    renderView();

    const row = screen.getByRole("button", { name: new RegExp(long.replace(/[.]/g, "\\.")) });
    expect(row).toHaveAttribute("title", long);
    expect(screen.getByText(".claude/skills/…/relations.md")).toHaveAttribute("aria-hidden", "true");
  });
});
