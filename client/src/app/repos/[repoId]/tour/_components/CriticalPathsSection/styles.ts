import type { CSSProperties } from "react";

/** Co-located styles for CriticalPathsSection. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 12, fontSize: 14.5 } satisfies CSSProperties,
  empty: { margin: 0, fontSize: 14, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 8,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    minWidth: 0,
  } satisfies CSSProperties,
  fileIcon: { color: "var(--text-muted)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  main: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 } satisfies CSSProperties,
  line: { display: "flex", alignItems: "baseline", gap: 12, minWidth: 0 } satisfies CSSProperties,
  importers: { fontSize: 12.5, color: "var(--text-secondary)", whiteSpace: "nowrap" } satisfies CSSProperties,
  chain: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  chainStep: { display: "inline-flex", gap: 6, alignItems: "baseline", minWidth: 0 } satisfies CSSProperties,
  description: { fontSize: 13.5, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
