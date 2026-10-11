import type { CSSProperties } from "react";

/** Co-located styles for RunLocallySection. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 12, fontSize: 14.5 } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "6px 8px 6px 16px",
    borderRadius: 8,
    background: "var(--code-bg)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  number: { fontSize: 12.5, color: "var(--text-muted)", minWidth: 14 } satisfies CSSProperties,
  command: {
    flex: 1,
    fontSize: 13.5,
    color: "var(--text-primary)",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  note: { margin: 0, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  /** Visually hidden but read by assistive tech (the "Copied" announcement). */
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    border: 0,
  } satisfies CSSProperties,
} as const;
