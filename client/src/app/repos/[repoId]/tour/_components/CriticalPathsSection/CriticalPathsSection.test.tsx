import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import onboardingMessages from "../../../../../../../messages/en/onboarding.json";

const withIntl = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: onboardingMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );

/* SPEC-02 S17 — critical-path rows: root path text, chain, importer count, description,
   no Open action; the empty note (AC-29, AC-30, AC-65, AC-70, AC-76). */

import { CriticalPathsSection } from "./CriticalPathsSection";

afterEach(() => {
  cleanup();
});

describe("CriticalPathsSection", () => {
  it("shows each root with its chain, importers and description, without an Open action", () => {
    withIntl(
      <CriticalPathsSection
        section={{
          body_md: null,
          entries: [
            { root: "src/server.ts", chain: ["src/app.ts", "src/db.ts"], importers: 14, description: "App bootstrap" },
            { root: "src/lib/redis.ts", chain: [], importers: null, description: null },
          ],
        }}
      />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("src/server.ts")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("src/db.ts")).toBeInTheDocument();
    expect(rows[0]!.textContent).toMatch(/14 importers/);
    expect(within(rows[0]!).getByText("App bootstrap")).toBeInTheDocument();
    // Importers unknown (degraded index) → no count at all.
    expect(rows[1]!.textContent).not.toMatch(/importer/);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("says no import chains were found when there are none (AC-30)", () => {
    withIntl(<CriticalPathsSection section={{ body_md: null, entries: [] }} />);
    expect(screen.getByText("No import chains found.")).toBeInTheDocument();
  });
});
