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

/* SPEC-02 S17 — the reading path keeps the server's order and says where it comes from
   (AC-25, AC-89); a long path is shortened in the middle with the full path kept (AC-67). */

import { ReadingPathSection } from "./ReadingPathSection";

afterEach(() => {
  cleanup();
});

const LONG_PATH = `src/${"deeply/nested/".repeat(8)}module/really-long-file-name.ts`;

describe("ReadingPathSection", () => {
  it("lists the files in the given order with their reasons and the PageRank note", () => {
    withIntl(
      <ReadingPathSection
        section={{
          body_md: null,
          items: [
            { path: "src/server.ts", reason: "Entry point" },
            { path: "src/api/index.ts", reason: null },
            { path: "src/auth.ts", reason: "Auth everywhere" },
          ],
        }}
      />,
    );
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["1src/server.tsEntry point", "2src/api/index.ts", "3src/auth.tsAuth everywhere"]);
    expect(screen.getByText(/ordered by import-graph importance \(PageRank\)/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shortens a long path in the middle and keeps the full path as tooltip and accessible text (AC-67)", () => {
    expect(LONG_PATH.length).toBeGreaterThan(120);
    withIntl(<ReadingPathSection section={{ body_md: null, items: [{ path: LONG_PATH, reason: null }] }} />);
    const code = screen.getByTitle(LONG_PATH);
    const visible = code.querySelector('[aria-hidden="true"]')!.textContent!;
    expect(visible).toContain("…");
    expect(visible.endsWith("really-long-file-name.ts")).toBe(true);
    expect(visible.length).toBeLessThan(LONG_PATH.length);
    expect(screen.getByText(LONG_PATH)).toBeInTheDocument();
  });
});
