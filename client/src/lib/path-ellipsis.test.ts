import { describe, it, expect } from "vitest";
import { middleEllipsisPath } from "./path-ellipsis";

describe("middleEllipsisPath", () => {
  it("returns a path that fits unchanged", () => {
    expect(middleEllipsisPath("specs/a.md", 30)).toBe("specs/a.md");
    expect(middleEllipsisPath("a".repeat(30), 30)).toBe("a".repeat(30));
  });

  it("keeps the leading segments that fit, then … and the whole file name", () => {
    const p = ".claude/skills/drizzle-orm-patterns/references/relations.md";
    expect(middleEllipsisPath(p, 30)).toBe(".claude/skills/…/relations.md");
    expect(middleEllipsisPath(p, 24)).toBe(".claude/…/relations.md");
    expect(middleEllipsisPath(p, 30).length).toBeLessThanOrEqual(30);
  });

  it("keeps rows with a shared prefix distinguishable", () => {
    const a = middleEllipsisPath(".claude/skills/drizzle-orm-patterns/references/queries.md", 30);
    const b = middleEllipsisPath(".claude/skills/drizzle-orm-patterns/references/schema.md", 30);
    expect(a).not.toBe(b);
  });

  it("cuts inside a first segment that is too long on its own", () => {
    expect(middleEllipsisPath("a-very-long-directory-name/x.md", 20)).toBe("a-very-long-di…/x.md");
  });

  it("never cuts a very long file name", () => {
    const file = "an-extremely-long-file-name-that-cannot-fit.md";
    expect(middleEllipsisPath(file, 20)).toBe(file);
    expect(middleEllipsisPath(`docs/deep/${file}`, 20)).toBe(`…/${file}`);
  });
});
