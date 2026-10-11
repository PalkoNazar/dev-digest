import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextDocRow } from "@devdigest/shared";
import messages from "../../../../../messages/en/context.json";
import { DocRow } from "./DocRow";

/* L05 manual-check fix — long paths are cut in the middle; the full path stays the
   title and the accessible name (AC-43). */

const actions = { onToggle: vi.fn(), onMove: vi.fn(), onDetach: vi.fn(), onPreview: vi.fn() };

function renderRow(path: string) {
  const row: ContextDocRow = { path, category: "skills", tokens: 10, state: "available", via: [] };
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ul>
        <DocRow row={row} pending={false} canMoveUp={false} canMoveDown={false} actions={actions} />
      </ul>
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("DocRow path", () => {
  it("shows a long path cut in the middle, keeping the full path as title and checkbox name (AC-43)", () => {
    const long = ".claude/skills/drizzle-orm-patterns/references/relations-and-joins.md";
    renderRow(long);
    expect(screen.getByRole("checkbox", { name: long })).toBeInTheDocument();
    const visible = screen.getByText(".claude/skills/…/relations-and-joins.md");
    expect(visible).toHaveAttribute("aria-hidden", "true");
    expect(visible.parentElement).toHaveAttribute("title", long);
  });

  it("shows a short path as is", () => {
    renderRow("specs/a.md");
    expect(screen.getByText("specs/a.md")).toHaveAttribute("title", "specs/a.md");
  });
});
