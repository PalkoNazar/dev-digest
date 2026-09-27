import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/common.json";
import { RunCostBadge } from "./RunCostBadge";
import { formatUsd, totalTokens } from "./helpers";

afterEach(cleanup);

describe("formatUsd", () => {
  it("unknown cost is an em dash, never $0.00", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(undefined)).toBe("—");
  });
  it("a truly free run is $0", () => {
    expect(formatUsd(0)).toBe("$0");
  });
  it("precision grows as the amount shrinks", () => {
    expect(formatUsd(1.234)).toBe("$1.23");
    expect(formatUsd(0.06)).toBe("$0.06");
    expect(formatUsd(1.2)).toBe("$1.20");
    expect(formatUsd(0.0001)).toBe("$0.0001");
    expect(formatUsd(0.00004)).toBe("<$0.0001");
    expect(formatUsd(0.0142)).toBe("$0.014");
    expect(formatUsd(0.00131)).toBe("$0.0013");
  });
});

describe("totalTokens", () => {
  it("sums in + out with separators; null when neither is known", () => {
    expect(totalTokens(8000, 1119)).toBe("9,119");
    expect(totalTokens(null, null)).toBeNull();
  });
});

function renderBadge(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ common: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("RunCostBadge", () => {
  it("compact shows only the cost", () => {
    renderBadge(<RunCostBadge usd={0.014} tokensIn={100} tokensOut={50} />);
    expect(screen.getByText("$0.014")).toBeInTheDocument();
    expect(screen.queryByText(/tok/)).not.toBeInTheDocument();
  });
  it("full shows total tokens · cost", () => {
    const { container } = renderBadge(
      <RunCostBadge variant="full" usd={0.0013} tokensIn={8000} tokensOut={1119} />,
    );
    expect(container.textContent).toBe("9,119 tok·$0.0013");
  });
  it("no cost data renders a dash", () => {
    renderBadge(<RunCostBadge usd={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
