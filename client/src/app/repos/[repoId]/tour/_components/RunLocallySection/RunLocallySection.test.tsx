import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

// Whole-branch REPRO (plan G3, AC-64, B4). Rule pinned: every copy is announced — the
// polite live region is mutated again on a repeated copy (cleared then set, or its text
// changes) and ends on "Copied"; a refused clipboard announces nothing and leaves no
// unhandled rejection.
describe("RunLocallySection — repeated and failed copies (B4, AC-64)", () => {
  const liveRegion = () => document.querySelector('[aria-live="polite"]');

  it("announces Copied again when the same command is copied twice", async () => {
    withIntl(<RunLocallySection section={{ body_md: null, steps: [{ command: "pnpm install" }], source: "llm" }} />);
    const button = screen.getByRole("button", { name: "Copy command: pnpm install" });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(liveRegion()!.textContent).toBe("Copied");

    // Record every change under the section after the first announcement.
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    try {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Copy command: pnpm install" }));
      });
      expect(writeText).toHaveBeenCalledTimes(2);
      await waitFor(() => {
        const live = liveRegion();
        expect(live).not.toBeNull();
        expect(live!.textContent).toBe("Copied");
        const touched = mutations.some(
          (m) =>
            live!.contains(m.target) ||
            Array.from(m.addedNodes).some((n) => n === live || n.contains(live!)),
        );
        expect(touched).toBe(true);
      });
    } finally {
      observer.disconnect();
    }
  });

  it("shows no Copied and leaves no unhandled rejection when the clipboard refuses", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      writeText.mockRejectedValue(new Error("Clipboard write denied"));
      withIntl(<RunLocallySection section={{ body_md: null, steps: [{ command: "pnpm install" }], source: "llm" }} />);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Copy command: pnpm install" }));
      });
      // Let Node report rejections that nothing handled (it does so after the microtasks).
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(writeText).toHaveBeenCalledWith("pnpm install");
      expect(liveRegion()!.textContent).not.toBe("Copied");
      expect(screen.queryByText("Copied")).not.toBeInTheDocument();
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
