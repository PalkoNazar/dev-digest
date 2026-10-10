import { describe, it, expect } from "vitest";
import type { BlastCaller } from "@devdigest/shared";
import { callerHref } from "./helpers";

const caller: BlastCaller = { name: "handler", file: "src/a.ts", line: 12 };

describe("callerHref", () => {
  it("links the caller's line at the given SHA", () => {
    expect(callerHref("acme/shop", "abc123", caller)).toBe(
      "https://github.com/acme/shop/blob/abc123/src/a.ts#L12",
    );
  });

  it("returns null without a repo or a SHA", () => {
    expect(callerHref(null, "abc123", caller)).toBeNull();
    expect(callerHref("acme/shop", null, caller)).toBeNull();
  });
});
