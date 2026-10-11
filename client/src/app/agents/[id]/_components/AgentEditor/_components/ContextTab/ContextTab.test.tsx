import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, ContextAttachments } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/context.json";

/* L05 S11 — agent Context tab (AC-12, AC-17, AC-20, AC-47). */

const REPO = "11111111-1111-4111-8111-111111111111";
let activeRepo: { id: string } | null = { id: REPO };
let view: ContextAttachments;
const mutate = vi.fn();

vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ activeRepo }) }));
vi.mock("@/lib/hooks/context", () => ({
  useAgentContext: () => ({ data: view, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetAgentContext: () => ({ mutate, isPending: false }),
  useContextDoc: () => ({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() }),
}));

import { ContextTab } from "./ContextTab";

const AGENT = { id: "ag1" } as Agent;
const row = (path: string, state: ContextAttachments["rows"][number]["state"], via: string[] = []) => ({
  path,
  category: path.includes("/") ? path.split("/")[0]! : "root",
  tokens: 50,
  state,
  via,
});

const BEFORE: ContextAttachments = {
  repo_id: REPO,
  rows: [
    row("specs/security.md", "attached", ["Rubric"]),
    row("specs/api.md", "attached"),
    ...["a", "b", "c", "d", "e"].map((n) => row(`docs/${n}.md`, "available")),
  ],
  attached: 2,
  total: 7,
  tokens: 317,
};

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  activeRepo = { id: REPO };
  view = BEFORE;
  mutate.mockReset();
});
afterEach(cleanup);

describe("Agent ContextTab", () => {
  it("asks to import or select a repo when none is active, without a list (AC-20)", () => {
    activeRepo = null;
    renderTab();
    expect(screen.getByText("Import or select a repo to attach its documents.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows 'K of M attached' and '≈ T tokens', and saves the new order on untick (AC-12, AC-17)", () => {
    renderTab();
    expect(screen.getByText("2 of 7 attached")).toBeInTheDocument();
    expect(screen.getByText("≈ 317 tokens")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "specs/security.md" }));
    expect(mutate).toHaveBeenCalledWith(["specs/api.md"]);
  });

  it("shows the server's answer: an unticked doc that a skill carries becomes 'via' (AC-47)", () => {
    const { rerender } = renderTab();
    view = {
      ...BEFORE,
      rows: [row("specs/api.md", "attached"), row("specs/security.md", "inherited", ["Rubric"]), ...BEFORE.rows.slice(2)],
      attached: 1,
    };
    rerender(
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <ContextTab agent={AGENT} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("via Rubric")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "specs/security.md" })).not.toBeInTheDocument();
    expect(screen.getByText("1 of 7 attached")).toBeInTheDocument();
  });
});
