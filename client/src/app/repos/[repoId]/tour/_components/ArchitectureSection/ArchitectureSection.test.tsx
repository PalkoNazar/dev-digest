import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import onboardingMessages from "../../../../../../../messages/en/onboarding.json";

/* SPEC-02 S17 — the overview text, the diagram (when there is one, AC-37), the stack and
   the top-level folders with their indexed-file counts (AC-45). */

vi.mock("@/components/mermaid-diagram", () => ({
  MermaidDiagram: ({ chart }: { chart: string }) => <div data-testid="mermaid">{chart}</div>,
}));

import { ArchitectureSection } from "./ArchitectureSection";

const withIntl = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: onboardingMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );

afterEach(() => {
  cleanup();
});

describe("ArchitectureSection", () => {
  it("renders the body, the diagram, the stack and folder counts", () => {
    withIntl(
      <ArchitectureSection
        section={{
          body_md: "Payments API fronts Stripe.",
          diagram: "flowchart LR\n  a --> b",
          stack: ["TypeScript", "Fastify"],
          folders: [
            { path: "src", files: 120 },
            { path: "scripts", files: 1 },
          ],
        }}
      />,
    );
    expect(screen.getByText("Payments API fronts Stripe.")).toBeInTheDocument();
    expect(screen.getByTestId("mermaid")).toHaveTextContent("flowchart LR");
    expect(screen.getByText("Fastify")).toBeInTheDocument();
    expect(screen.getByText("120 indexed files")).toBeInTheDocument();
    expect(screen.getByText("1 indexed file")).toBeInTheDocument();
  });

  it("renders no diagram when the tour has none", () => {
    withIntl(<ArchitectureSection section={{ body_md: "Body", diagram: null, stack: [], folders: [] }} />);
    expect(screen.queryByTestId("mermaid")).not.toBeInTheDocument();
  });
});
