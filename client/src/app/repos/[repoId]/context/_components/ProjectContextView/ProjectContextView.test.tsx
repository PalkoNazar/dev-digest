import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SpecFile } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/context.json";

/* L05 S9 — Project Context page (AC-1–AC-8, AC-27). Hooks are mocked; the
   refresh flow itself is BlastRadiusCard's (resyncFinished tests in lib). */

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

describe("ProjectContextView", () => {
  it("shows a loading state, not the empty state, while the list loads (AC-6)", () => {
    docsState.isLoading = true;
    renderView();
    expect(screen.queryByText("No Markdown documents")).not.toBeInTheDocument();
  });

  it("shows the empty state when the repo has no documents (AC-7)", () => {
    docsState.data = [];
    renderView();
    expect(screen.getByText("No Markdown documents")).toBeInTheDocument();
    expect(screen.getByText(/Every \.md file of this repo’s default branch is listed here/)).toBeInTheDocument();
  });

  it("shows an error with Retry that re-lists (AC-8)", () => {
    docsState.isError = true;
    renderView();
    expect(screen.getByText("Couldn’t read the repo’s documents")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it("lists documents with categories, previews the selected one and shows its usage (AC-1–AC-3, AC-5, AC-27)", () => {
    docsState.data = [doc("README.md", "root", 1), doc("specs/x.md", "specs", 2), doc("docs/y.md", "docs")];
    docContent.mockImplementation((path) => `# Heading of ${path}`);
    renderView();

    const readme = screen.getByRole("button", { name: /README\.md/ });
    expect(readme).toHaveTextContent("root");
    const spec = screen.getByRole("button", { name: /specs\/x\.md/ });
    expect(spec).toHaveTextContent("specs");

    fireEvent.click(spec);
    expect(screen.getByRole("heading", { name: "Heading of specs/x.md" })).toBeInTheDocument();
    expect(screen.getByText(/Used by/).textContent).toBe("Used by 2 agents");

    expect(screen.getByText(/last sync/).textContent).toBe("3 documents · last sync never");
  });

  it("renders document content without HTML elements from it (AC-4)", () => {
    docsState.data = [doc("evil.md", "root")];
    docContent.mockReturnValue('Hi <script>alert(1)</script> <img src=x onerror="alert(2)">');
    const { container } = renderView();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
});
