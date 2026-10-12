import type { CSSProperties } from "react";

/** Co-located styles for ArchitectureSection. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 16, fontSize: 14.5 } satisfies CSSProperties,
  subhead: {
    margin: "0 0 8px",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  stack: { display: "flex", flexWrap: "wrap", gap: 6 } satisfies CSSProperties,
  folders: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 6,
  } satisfies CSSProperties,
  folder: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    padding: "6px 10px",
    borderRadius: 6,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    minWidth: 0,
  } satisfies CSSProperties,
  count: { fontSize: 12.5, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
