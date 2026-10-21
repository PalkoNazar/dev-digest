import { describe, it, expect } from "vitest";
import { diffFocusHref, focusFromSearch } from "./helpers";

const BASE = "/repos/r1/pulls/7";

describe("diffFocusHref", () => {
  it("builds the Files changed query with file and line, keeping other params", () => {
    const href = diffFocusHref(BASE, new URLSearchParams("tab=overview&trace=run-1"), "src/a b.ts", 12);
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe(BASE);
    expect(url.searchParams.get("tab")).toBe("diff");
    expect(url.searchParams.get("file")).toBe("src/a b.ts");
    expect(url.searchParams.get("line")).toBe("12");
    expect(url.searchParams.get("trace")).toBe("run-1");
  });

  it("drops a null line (and a stale one from the current URL)", () => {
    const href = diffFocusHref(BASE, new URLSearchParams("file=old.ts&line=9"), "src/a.ts", null);
    const url = new URL(href, "http://x");
    expect(url.searchParams.get("file")).toBe("src/a.ts");
    expect(url.searchParams.has("line")).toBe(false);
  });
});

describe("focusFromSearch", () => {
  it("reads file + line", () => {
    expect(focusFromSearch(new URLSearchParams("tab=diff&file=src%2Fa.ts&line=42"))).toEqual({
      path: "src/a.ts",
      line: 42,
    });
  });

  it("no file → no focus", () => {
    expect(focusFromSearch(new URLSearchParams("tab=diff&line=3"))).toBeNull();
  });

  it.each(["0", "-3", "1.5", "12abc", "", "99999999999999999999"])("rejects line %j", (line) => {
    expect(focusFromSearch(new URLSearchParams({ file: "a.ts", line }))).toEqual({ path: "a.ts", line: null });
  });
});
