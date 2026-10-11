import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

/* SPEC-02 S17 — grounded paths render as code, never as links (AC-79); raw HTML in tour
   text is not rendered (AC-60). */

import { TourMarkdown } from "./TourMarkdown";

afterEach(() => {
  cleanup();
});

describe("TourMarkdown", () => {
  it("renders a grounded path as inline code with no link", () => {
    const { container } = render(<TourMarkdown md={"Start at `src/a.ts` then read on."} />);
    expect(container.querySelector("code")?.textContent).toBe("src/a.ts");
    expect(container.querySelector("a")).toBeNull();
  });

  it("does not render script or img elements from the text", () => {
    const { container } = render(
      <TourMarkdown md={'Hello <script>alert(1)</script> <img src="x" onerror="alert(2)"> world'} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
});
