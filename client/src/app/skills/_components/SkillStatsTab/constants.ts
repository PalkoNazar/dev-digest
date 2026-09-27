/** Donut colours per finding category (mockup: security red, bug amber, perf violet, style blue). */
export const CATEGORY_COLOR: Record<string, string> = {
  security: "var(--crit)",
  bug: "var(--warn)",
  perf: "#a78bfa",
  style: "var(--accent)",
  test: "var(--ok)",
};

/** Colour for a category the map doesn't know. */
export const FALLBACK_CATEGORY_COLOR = "var(--info)";
