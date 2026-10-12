import type { CSSProperties } from "react";

/** Co-located styles for ReadingPathSection. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 12, fontSize: 14.5 } satisfies CSSProperties,
  note: { margin: 0, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  item: { display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0 } satisfies CSSProperties,
  number: {
    width: 24,
    height: 24,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    fontSize: 12,
    fontWeight: 600,
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  main: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 } satisfies CSSProperties,
  reason: { fontSize: 13.5, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
