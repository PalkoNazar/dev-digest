import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Markdown } from "./Markdown";

afterEach(cleanup);

/* Markdown renders user-controlled text (skill bodies, PR descriptions). It must
   never turn that text into live HTML or script URLs. */
describe("Markdown (untrusted input)", () => {
  it("renders raw HTML as text, not elements", () => {
    const { container } = render(
      <Markdown>{'<img src=x onerror="alert(1)"> <script>alert(2)</script> **bold**'}</Markdown>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    expect(container.querySelector("strong")?.textContent).toBe("bold");
  });

  it("drops javascript: link targets", () => {
    const { container } = render(<Markdown>{"[click](javascript:alert(1)) [ok](https://example.com)"}</Markdown>);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.toLowerCase().startsWith("javascript:"))).toBe(false);
    expect(hrefs).toContain("https://example.com");
  });
});
