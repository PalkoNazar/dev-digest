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

/* Tailwind's preflight strips heading sizes and list markers; the `document` variant
   restores them for whole files, the default `compact` variant stays as it was. */
describe("Markdown variants", () => {
  const md = "## Goals\n\n- one\n- two\n\n```\ncode block\n```";

  it("document: styles headings, lists and code blocks", () => {
    const { container } = render(<Markdown variant="document">{md}</Markdown>);
    expect(container.querySelector("h2")?.style.fontSize).toBe("17px");
    expect(container.querySelector("ul")?.style.listStyleType).toBe("disc");
    // A fenced block's code is not drawn as an inline chip.
    expect(container.querySelector("pre code")?.getAttribute("style")).toBeNull();
  });

  it("compact (default): leaves block elements unstyled", () => {
    const { container } = render(<Markdown>{md}</Markdown>);
    expect(container.querySelector("h2")?.getAttribute("style")).toBeNull();
    expect(container.querySelector("ul")?.getAttribute("style")).toBeNull();
  });
});
