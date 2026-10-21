import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Risk } from "@devdigest/shared";
import brief from "../../../../../../../../../../../../messages/en/brief.json";
import { RiskAreas } from "./RiskAreas";

afterEach(cleanup);

const RISKS: Risk[] = [
  {
    kind: "auth",
    title: "Auth surface touched",
    explanation: "The middleware now runs before <b>auth</b>.",
    severity: "high",
    file_refs: ["src/middleware/ratelimit.ts:12-18", "src/blast-only.ts:4"],
  },
  { kind: "dep", title: "New dependency", explanation: "ioredis", severity: "low", file_refs: [] },
];

function renderList(risks: Risk[], onOpen = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ brief }}>
      <RiskAreas risks={risks} changedFiles={["src/middleware/ratelimit.ts"]} onOpenInDiff={onOpen} />
    </NextIntlClientProvider>,
  );
  return onOpen;
}

describe("RiskAreas", () => {
  it("shows each risk with severity text, refs that jump, and an expandable plain-text explanation", () => {
    const onOpen = renderList(RISKS);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("High severity")).toBeInTheDocument();
    expect(within(items[1]!).getByText("Low severity")).toBeInTheDocument();
    expect(within(items[0]!).getByText("src/middleware/ratelimit.ts:12-18")).toHaveAttribute(
      "title",
      "src/middleware/ratelimit.ts:12-18",
    );

    const toggle = screen.getByRole("button", { name: "Show explanation: Auth surface touched" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/The middleware now runs/)).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide explanation: Auth surface touched" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // Model text is literal: the tag is shown, not rendered.
    expect(screen.getByText("The middleware now runs before <b>auth</b>.")).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open src/middleware/ratelimit.ts line 12 in Files changed" }));
    expect(onOpen).toHaveBeenCalledWith("src/middleware/ratelimit.ts", 12);
  });

  it("a ref outside the PR's diff shows a notice and does not jump", () => {
    const onOpen = renderList(RISKS);
    fireEvent.click(screen.getByRole("button", { name: "Open src/blast-only.ts line 4 in Files changed" }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("File not in this PR's diff");
  });

  it("no risks → empty text", () => {
    renderList([]);
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
  });
});
