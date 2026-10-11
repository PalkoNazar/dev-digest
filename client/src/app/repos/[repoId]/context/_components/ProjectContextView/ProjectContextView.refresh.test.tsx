import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { SpecFile } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/context.json";

/* L05 R3 · B2 — Refresh (AC-9) resyncs the repo and re-lists the documents; the
   selected document's preview must be re-read too, else it keeps the text from
   before the resync. Unlike ProjectContextView.test.tsx, the context hooks are real
   (real QueryClient, fake transport) so the test holds whether the fix refetches or
   invalidates; the resync flow is driven through mocked repo-intel hooks. */

const get = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args) } }));

const intel: { updatedAt: string } = { updatedAt: "" };
const resync = vi.fn();
vi.mock("@/lib/hooks/repo-intel", () => ({
  useRepoIntelStatus: () => ({ data: { updatedAt: intel.updatedAt } }),
  useResyncRepoIntel: () => ({ mutate: resync, isPending: false }),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repos: [{ id: "r1", full_name: "acme/api" }] }),
  useRepoNotFound: () => false,
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { ProjectContextView } from "./ProjectContextView";

const LIST_URL = "/repos/r1/context";
const FILE_URL = `/repos/r1/context/file?path=${encodeURIComponent("README.md")}`;
const README: SpecFile = { path: "README.md", category: "root", size: 100, tokens: 25, used_by: 0 };

let content = "";
const listReads = () => get.mock.calls.filter(([url]) => url === LIST_URL).length;
const fileReads = () => get.mock.calls.filter(([url]) => url === FILE_URL).length;

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <ProjectContextView repoId="r1" />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  return { rerender: () => view.rerender(tree()) };
}

beforeEach(() => {
  intel.updatedAt = "2026-10-01T10:00:00.000Z";
  content = "# Before resync";
  resync.mockReset();
  get.mockReset();
  get.mockImplementation((url: string) => {
    if (url === LIST_URL) return Promise.resolve([README]);
    if (url === FILE_URL) return Promise.resolve({ ...README, content });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
});
afterEach(cleanup);

describe("ProjectContextView refresh (B2)", () => {
  it("re-reads the selected document's preview when the refresh completes", async () => {
    const { rerender } = renderView();
    expect(await screen.findByRole("heading", { name: "Before resync" })).toBeInTheDocument();
    expect(fileReads()).toBe(1);

    // The resync job changes the document; the index state then gets a new row.
    fireEvent.click(screen.getByRole("button", { name: "Resync the repo and re-list documents" }));
    expect(resync).toHaveBeenCalledTimes(1);
    content = "# After resync";
    intel.updatedAt = "2026-10-01T10:05:00.000Z";
    rerender();

    // The refresh completed: the list was re-read.
    await waitFor(() => expect(listReads(), "document list GETs").toBe(2));
    await waitFor(() => expect(fileReads(), "selected document GETs").toBe(2));
    expect(await screen.findByRole("heading", { name: "After resync" })).toBeInTheDocument();
  });
});
