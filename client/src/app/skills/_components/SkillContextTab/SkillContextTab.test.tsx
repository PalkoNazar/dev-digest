import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextAttachments } from "@devdigest/shared";
import messages from "../../../../../messages/en/context.json";
import { serializesAs } from "./helpers";

/* L05 S11 — skill Context tab (AC-22, AC-24, AC-25). */

const REPO = "11111111-1111-4111-8111-111111111111";
const VIEW: ContextAttachments = {
  repo_id: REPO,
  rows: [
    { path: "specs/public-api.md", category: "specs", tokens: 90, state: "attached", via: [] },
    { path: "docs/arch.md", category: "docs", tokens: 60, state: "attached", via: [] },
    { path: "README.md", category: "root", tokens: 20, state: "available", via: [] },
  ],
  attached: 2,
  total: 3,
  tokens: 150,
};

vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ activeRepo: { id: REPO } }) }));
vi.mock("@/lib/hooks/context", () => ({
  useSkillContext: () => ({ data: VIEW, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetSkillContext: () => ({ mutate: vi.fn(), isPending: false }),
  useContextDoc: () => ({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() }),
}));

import { SkillContextTab } from "./SkillContextTab";

afterEach(cleanup);

describe("SkillContextTab", () => {
  it("shows the attached count, the token total and the 'Serializes as' block in order", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <SkillContextTab skillId="s1" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("2 attached")).toBeInTheDocument();
    expect(screen.getByText("≈ 150 tokens")).toBeInTheDocument();
    expect(screen.getByText("Serializes as")).toBeInTheDocument();
    expect(screen.getByText(/^## Project context/).textContent).toBe(
      "## Project context\n- specs/public-api.md\n- docs/arch.md",
    );
  });

  it("serializesAs lists the heading alone when nothing is attached", () => {
    expect(serializesAs([])).toBe("## Project context");
  });
});
