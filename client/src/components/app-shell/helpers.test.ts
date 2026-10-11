import { describe, expect, it } from "vitest";
import { activeKeyFor } from "./helpers";

/* SPEC-02 S13 — the sidebar highlight for the Onboarding Tour (AC-1, AC-2, EC-19). */
describe("activeKeyFor", () => {
  it("does not mark the add-repository page (/onboarding) as the Onboarding Tour (AC-2)", () => {
    expect(activeKeyFor("/onboarding")).toBe("");
  });

  it("marks the tour page of a repo as the Onboarding Tour (AC-1)", () => {
    expect(activeKeyFor("/repos/r1/tour")).toBe("onboarding-tour");
    expect(activeKeyFor("/repos/r1/tour/")).toBe("onboarding-tour");
  });

  it("does not treat a path that only starts with 'tour' as the tour", () => {
    expect(activeKeyFor("/repos/r1/tours")).not.toBe("onboarding-tour");
  });

  it("keeps the other repo-scoped items unchanged", () => {
    expect(activeKeyFor("/repos/r1/context")).toBe("context");
    expect(activeKeyFor("/repos/r1/pulls")).toBe("pulls");
    expect(activeKeyFor("/repos/r1/conventions")).toBe("conventions");
  });
});
