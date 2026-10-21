import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewFocusItem } from "@devdigest/shared";
import brief from "../../../../../../../../../../../../messages/en/brief.json";
import { ReviewFocus } from "./ReviewFocus";

afterEach(cleanup);

const ITEMS: ReviewFocusItem[] = [
  { file: "src/config.ts", line: 12, reason: "live key committed", outside_changed_lines: false },
  { file: "src/api/users.ts", line: 46, reason: "N+1 <i>query</i>", outside_changed_lines: true },
  { file: "src/caller.ts", line: null, reason: "caller of rateLimit", outside_changed_lines: false },
];

function renderList(items: ReviewFocusItem[], onOpen = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ brief }}>
      <ReviewFocus items={items} changedFiles={["src/config.ts", "src/api/users.ts"]} onOpenInDiff={onOpen} />
    </NextIntlClientProvider>,
  );
  return onOpen;
}

describe("ReviewFocus", () => {
  it("lists items in order under the heading with the count; each item is a named button that jumps", () => {
    const onOpen = renderList(ITEMS);
    expect(screen.getByText("Review focus — read these first")).toBeInTheDocument();
    expect(screen.getByText("3 items")).toBeInTheDocument();

    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Open src/config.ts line 12 in Files changed",
      "Open src/api/users.ts line 46 in Files changed",
      "Open src/caller.ts in Files changed",
    ]);
    expect(buttons[0]).toHaveTextContent("src/config.ts:12— live key committed");
    expect(buttons[2]).toHaveTextContent("src/caller.ts— caller of rateLimit");
    expect(buttons[1]).toHaveAttribute("title", "src/api/users.ts:46");
    // Literal model text + the outside-lines hint only on the marked item.
    expect(screen.getByText("— N+1 <i>query</i>")).toBeInTheDocument();
    expect(screen.getAllByText("line outside the changed lines")).toHaveLength(1);

    fireEvent.click(buttons[1]!);
    expect(onOpen).toHaveBeenCalledWith("src/api/users.ts", 46);
  });

  it("an item whose file is not a changed file shows the notice and stays", () => {
    const onOpen = renderList(ITEMS);
    fireEvent.click(screen.getByRole("button", { name: "Open src/caller.ts in Files changed" }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("File not in this PR's diff");
  });

  it("no items → empty text", () => {
    renderList([]);
    expect(screen.getByText("No starting points were suggested.")).toBeInTheDocument();
    expect(screen.getByText("0 items")).toBeInTheDocument();
  });
});
