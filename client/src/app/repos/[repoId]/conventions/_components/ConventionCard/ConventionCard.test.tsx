import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ToastProvider } from "@/lib/toast";
import { ConventionCard } from "./ConventionCard";

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  category: "error-handling",
  rule: "Throw NotFoundError for a missing entity",
  evidence: [
    { path: "src/users/service.ts", line_start: 4, line_end: 4, snippet: "throw new NotFoundError('user');" },
    { path: "src/orders/routes.ts", line_start: 9, line_end: 9, snippet: "throw new NotFoundError('order');" },
  ],
  confidence: 0.91,
  adherence: 0.94,
  support_files: 47,
  violation_files: 3,
  status: "pending",
  edited: false,
  created_at: "",
};

function renderCard(candidate: ConventionCandidate = CANDIDATE) {
  const onUpdate = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ToastProvider>
        <ConventionCard candidate={candidate} onUpdate={onUpdate} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return onUpdate;
}

afterEach(cleanup);

describe("ConventionCard", () => {
  it("shows the rule, verified evidence and measured adherence", () => {
    renderCard();
    expect(screen.getByText("Throw NotFoundError for a missing entity")).toBeInTheDocument();
    expect(screen.getByText("src/users/service.ts:4")).toBeInTheDocument();
    expect(screen.getByText("+1 more")).toBeInTheDocument();
    expect(screen.getByText("throw new NotFoundError('user');")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("94% · 47/50 files follow it")).toBeInTheDocument();
  });

  it("says when a rule could not be measured and when tooling enforces it", () => {
    renderCard({
      ...CANDIDATE,
      adherence: null,
      support_files: null,
      violation_files: null,
      enforced_by: "prettier (.prettierrc): quotes",
    });
    expect(screen.getByText("not measured — no code pattern")).toBeInTheDocument();
    expect(screen.getByText("Enforced by prettier (.prettierrc): quotes")).toBeInTheDocument();
  });

  it("accepts, and a second click on Accepted returns it to pending", () => {
    const onUpdate = renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Accept/ }));
    expect(onUpdate).toHaveBeenLastCalledWith({ status: "accepted" });
    cleanup();
    const again = renderCard({ ...CANDIDATE, status: "accepted" });
    fireEvent.click(screen.getByRole("button", { name: /Accepted/ }));
    expect(again).toHaveBeenLastCalledWith({ status: "pending" });
  });

  it("rejects", () => {
    const onUpdate = renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Reject/ }));
    expect(onUpdate).toHaveBeenCalledWith({ status: "rejected" });
  });

  it("edits the rule inline and saves only a real change", () => {
    const onUpdate = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Throw NotFoundError, never Error  " } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(onUpdate).toHaveBeenCalledWith({ rule: "Throw NotFoundError, never Error" });

    onUpdate.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
