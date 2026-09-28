import { describe, expect, it } from "vitest";
import { NAV, SETTINGS_ITEM, SHORTCUTS } from "./nav";

const allItems = [...NAV.flatMap((g) => g.items), SETTINGS_ITEM];

describe("NAV", () => {
  it("groups Agents with Skills under SKILLS LAB", () => {
    const sectionOf = (key: string) => NAV.find((g) => g.items.some((it) => it.key === key))?.section;
    expect(sectionOf("agents")).toBe("SKILLS LAB");
    expect(sectionOf("skills")).toBe("SKILLS LAB");
    expect(sectionOf("pulls")).toBe("WORKSPACE");
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
