import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import onboardingMessages from "../../../../../../../messages/en/onboarding.json";

const withIntl = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: onboardingMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );

/* SPEC-02 S17 — first tasks as Markdown (AC-90), or the skeleton note (AC-45). */

import { FirstTasksSection } from "./FirstTasksSection";

afterEach(() => {
  cleanup();
});

describe("FirstTasksSection", () => {
  it("renders the LLM's tasks as Markdown", () => {
    withIntl(<FirstTasksSection section={{ body_md: "- Add a **health check** in `src/server.ts`" }} />);
    expect(screen.getByText("health check").tagName).toBe("STRONG");
    expect(screen.queryByText(/need the LLM/i)).not.toBeInTheDocument();
  });

  it("says first tasks need the LLM on a skeleton tour", () => {
    withIntl(<FirstTasksSection section={{ body_md: null }} />);
    expect(screen.getByText(/first tasks need the LLM/i)).toBeInTheDocument();
  });
});
