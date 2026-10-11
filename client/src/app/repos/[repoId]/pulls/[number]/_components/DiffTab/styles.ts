import type { CSSProperties } from "react";

export const s = {
  right: { display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" } satisfies CSSProperties,
  orderGroup: {
    display: "inline-flex",
    gap: 2,
    padding: 2,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  stat: { fontSize: 12, marginLeft: 8, textTransform: "none", letterSpacing: 0 } satisfies CSSProperties,
  addText: { color: "var(--code-add-text)" } satisfies CSSProperties,
  delText: { color: "var(--code-del-text)" } satisfies CSSProperties,
  empty: {
    margin: "0 0 14px",
    padding: "8px 12px",
    border: "1px dashed var(--border)",
    borderRadius: 7,
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
