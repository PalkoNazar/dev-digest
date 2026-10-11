import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { TraceSpecDoc } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { SpecsPromptBlock } from "./SpecsPromptBlock";

afterEach(cleanup);

const DOCS: TraceSpecDoc[] = [{ path: "specs/alpha.md", status: "injected", text: "Alpha body.", tokens: 12 }];

function renderBlock() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <SpecsPromptBlock docs={DOCS} color="var(--accent)" />
    </NextIntlClientProvider>,
  );
}

/* S12 / AC-53 — the block header and each document row are semantic expander buttons. */
describe("SpecsPromptBlock expanders", () => {
  it("toggles aria-expanded on the block header and the document row", () => {
    renderBlock();
    const head = screen.getByRole("button", { name: /Project context/ });
    expect(head).toHaveAttribute("type", "button");
    expect(head).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("specs/alpha.md")).not.toBeInTheDocument();

    fireEvent.click(head);
    expect(head).toHaveAttribute("aria-expanded", "true");

    const row = screen.getByRole("button", { name: /specs\/alpha\.md/ });
    expect(row).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Alpha body.")).toBeInTheDocument();

    fireEvent.click(head);
    expect(head).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Alpha body.")).not.toBeInTheDocument();
  });
});
