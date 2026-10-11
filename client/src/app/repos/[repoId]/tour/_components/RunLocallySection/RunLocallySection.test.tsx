import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import onboardingMessages from "../../../../../../../messages/en/onboarding.json";

const withIntl = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: onboardingMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );

/* SPEC-02 S17 — run steps: exact command copied, "Copied" announced, copy controls named
   after their command, the deterministic note (AC-63, AC-64, AC-66, AC-82). */

import { RunLocallySection } from "./RunLocallySection";

const LONG = "docker compose up -d postgres redis # needs Docker running";
const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(() => {
  cleanup();
});

describe("RunLocallySection", () => {
  it("copies exactly the step's command and announces Copied politely (AC-63, AC-64, AC-66)", async () => {
    withIntl(
      <RunLocallySection
        section={{ body_md: null, steps: [{ command: "pnpm install" }, { command: LONG }], source: "llm" }}
      />,
    );
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live!.textContent).toBe("");

    const copy = screen.getByRole("button", { name: `Copy command: ${LONG}` });
    await act(async () => {
      fireEvent.click(copy);
    });
    expect(writeText).toHaveBeenCalledWith(LONG);
    expect(live!.textContent).toBe("Copied");
    expect(screen.getByRole("button", { name: "Copy command: pnpm install" })).toBeInTheDocument();
    expect(screen.queryByText(/derived from the repo/i)).not.toBeInTheDocument();
  });

  it("notes when the steps were built from repo facts instead of the LLM (AC-82)", () => {
    withIntl(<RunLocallySection section={{ body_md: null, steps: [{ command: "npm install" }], source: "deterministic" }} />);
    expect(screen.getByText(/derived from the repo/i)).toBeInTheDocument();
  });
});
