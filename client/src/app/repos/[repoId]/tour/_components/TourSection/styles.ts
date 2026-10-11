import type { CSSProperties } from "react";

/** Co-located styles for TourSection. */
export const s = {
  card: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "18px 22px 22px",
    scrollMarginTop: 16,
  } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  icon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: "grid",
    placeItems: "center",
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
    flexShrink: 0,
  } satisfies CSSProperties,
  title: {
    flex: 1,
    margin: 0,
    fontSize: 17,
    fontWeight: 600,
    color: "var(--text-primary)",
    outline: "none",
  } satisfies CSSProperties,
  toggle: {
    width: 30,
    height: 30,
    display: "grid",
    placeItems: "center",
    borderRadius: 6,
    border: "1px solid transparent",
    background: "transparent",
    color: "var(--text-secondary)",
    cursor: "pointer",
  } satisfies CSSProperties,
  chevronOpen: { transform: "rotate(180deg)" } satisfies CSSProperties,
  body: { marginTop: 14 } satisfies CSSProperties,
} as const;
