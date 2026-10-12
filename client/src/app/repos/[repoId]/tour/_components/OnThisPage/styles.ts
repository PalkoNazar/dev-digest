import type { CSSProperties } from "react";

/** Co-located styles for OnThisPage. */
export const s = {
  nav: { position: "sticky", top: 24, alignSelf: "start" } satisfies CSSProperties,
  label: {
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 12,
  } satisfies CSSProperties,
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    borderLeft: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,
  entry: {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "6px 12px",
    fontSize: 13.5,
    color: "var(--text-secondary)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
  } satisfies CSSProperties,
} as const;
