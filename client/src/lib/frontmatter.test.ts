import { describe, it, expect } from "vitest";
import { splitFrontmatter } from "./frontmatter";

describe("splitFrontmatter", () => {
  it("splits a leading frontmatter block from the body", () => {
    const text = "---\nname: drizzle\nskills:\n  - zod\n---\n# Title\n\nBody";
    expect(splitFrontmatter(text)).toEqual({ frontmatter: "name: drizzle\nskills:\n  - zod", body: "# Title\n\nBody" });
  });

  it("handles CRLF line endings and a block that ends the file", () => {
    expect(splitFrontmatter("---\r\na: 1\r\n---\r\nBody")).toEqual({ frontmatter: "a: 1", body: "Body" });
    expect(splitFrontmatter("---\na: 1\n---")).toEqual({ frontmatter: "a: 1", body: "" });
  });

  it("keeps a document without frontmatter whole", () => {
    expect(splitFrontmatter("# Title\n\nBody")).toEqual({ frontmatter: null, body: "# Title\n\nBody" });
    expect(splitFrontmatter(" ---\na: 1\n---\nBody").frontmatter).toBeNull();
  });

  it("treats an unclosed opener as body", () => {
    const text = "---\nname: x\n# Title";
    expect(splitFrontmatter(text)).toEqual({ frontmatter: null, body: text });
  });

  it("leaves a horizontal rule later in the body untouched", () => {
    const text = "# Title\n\n---\n\nMore";
    expect(splitFrontmatter(text)).toEqual({ frontmatter: null, body: text });
    expect(splitFrontmatter("---\na: 1\n---\nIntro\n\n---\n\nMore").body).toBe("Intro\n\n---\n\nMore");
  });
});
