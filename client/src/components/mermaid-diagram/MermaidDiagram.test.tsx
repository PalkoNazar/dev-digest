import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

/* SPEC-02 S15 — diagrams render with scripts and HTML labels off (AC-61), and an
   invalid diagram renders nothing, not an error graphic (AC-38). */

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(),
  render: vi.fn(),
}));
vi.mock("mermaid", () => ({ default: mermaid }));

import { MermaidDiagram } from "./MermaidDiagram";

beforeEach(() => {
  mermaid.initialize.mockReset();
  mermaid.parse.mockReset();
  mermaid.render.mockReset();
});
afterEach(() => {
  cleanup();
});

describe("MermaidDiagram", () => {
  it("initializes mermaid with strict security and no HTML labels, then renders the SVG (AC-61)", async () => {
    mermaid.parse.mockResolvedValue(true);
    mermaid.render.mockResolvedValue({ svg: "<svg data-ok='1'></svg>" });
    const { container } = render(<MermaidDiagram chart={"flowchart LR\n  a --> b"} />);
    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: "strict", htmlLabels: false }),
    );
  });

  it("renders nothing and no error text when mermaid can't parse the diagram (AC-38)", async () => {
    mermaid.parse.mockResolvedValue(false);
    const { container } = render(<MermaidDiagram chart={"flowchart LR\n  a -->"} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(mermaid.render).not.toHaveBeenCalled();
    expect(container.textContent).toBe("");
  });
});
