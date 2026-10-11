import { describe, expect, it } from "vitest";
import { NAV, SETTINGS_ITEM, SHORTCUTS, resolveHref } from "./nav";

const allItems = [...NAV.flatMap((g) => g.items), SETTINGS_ITEM];

describe("NAV", () => {
  it("groups Skills, Agents and Conventions under SKILLS LAB", () => {
    const sectionOf = (key: string) => NAV.find((g) => g.items.some((it) => it.key === key))?.section;
    expect(sectionOf("agents")).toBe("SKILLS LAB");
    expect(sectionOf("skills")).toBe("SKILLS LAB");
    expect(sectionOf("conventions")).toBe("SKILLS LAB");
    expect(sectionOf("pulls")).toBe("WORKSPACE");
  });

  it("lists Onboarding Tour under WORKSPACE between Pull Requests and Project Context (L05, SPEC-02 AC-1)", () => {
    const workspace = NAV.find((g) => g.section === "WORKSPACE")!.items.map((it) => it.key);
    expect(workspace).toEqual(["pulls", "onboarding-tour", "context"]);
    const items = NAV.flatMap((g) => g.items);
    expect(items.find((it) => it.key === "context")?.href).toBe("/repos/:repoId/context");
    const tour = items.find((it) => it.key === "onboarding-tour");
    expect(tour?.label).toBe("Onboarding Tour");
    expect(resolveHref(tour!.href, "r1")).toBe("/repos/r1/tour");
  });

  it("item keys are unique (the sidebar keys and highlights items by them)", () => {
    const keys = allItems.map((it) => it.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("g-nav keys are unique (useGlobalShortcuts navigates to the first match)", () => {
    const gKeys = allItems.flatMap((it) => (it.gKey ? [it.gKey] : []));
    expect(new Set(gKeys).size).toBe(gKeys.length);
  });

  it("every 'g x' shortcut in the help registry points at a nav item", () => {
    const gKeys = new Set(allItems.map((it) => it.gKey));
    const gShortcuts = SHORTCUTS.filter((s) => /^g .$/.test(s.keys));
    expect(gShortcuts.length).toBeGreaterThan(0);
    for (const s of gShortcuts) expect(gKeys, s.keys).toContain(s.keys.slice(2));
  });
});
