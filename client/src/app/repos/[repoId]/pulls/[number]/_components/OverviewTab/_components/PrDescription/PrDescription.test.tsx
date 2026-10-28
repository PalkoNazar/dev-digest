import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PrDescription } from "./PrDescription";

afterEach(cleanup);

describe("PrDescription", () => {
  it("renders the PR body as Markdown: headings, emphasis, code, lists and tables", () => {
    const body = [
      "## PR Brief",
      "",
      "One **PR Brief** block with `file:line` items.",
      "",
      "- first",
      "- second",
      "",
      "| Commit | Stage |",
      "|---|---|",
      "| 6060e0d | R1 contract |",
    ].join("\n");
    render(<PrDescription body={body} />);

    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "PR Brief" })).toBeInTheDocument();
    expect(screen.getByText("PR Brief", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("file:line", { selector: "code" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("cell", { name: "R1 contract" })).toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it("never renders raw HTML from the body", () => {
    const { container } = render(
      <PrDescription body={'Hi <img src=x onerror="alert(1)"> <script>alert(2)</script>'} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });
});
