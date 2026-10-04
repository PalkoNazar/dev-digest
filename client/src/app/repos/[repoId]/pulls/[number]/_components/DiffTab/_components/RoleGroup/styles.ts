import type { CSSProperties } from "react";
import { ROLE_HEADER_STICKY_TOP } from "./constants";

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 } satisfies CSSProperties,
  header: {
    position: "sticky",
    top: ROLE_HEADER_STICKY_TOP,
    zIndex: 4, // below PrDetailHeader (5)
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "8px 12px",
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
  } satisfies CSSProperties,
  chevron: (open: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
    flexShrink: 0,
  }),
  square: (color: string): CSSProperties => ({
    width: 10,
    height: 10,
    borderRadius: 2,
    background: color,
    flexShrink: 0,
  }),
  label: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  hint: {
    fontSize: 12,
    color: "var(--text-muted)",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  findings: { fontSize: 12, fontWeight: 600, color: "var(--warn)" } satisfies CSSProperties,
  count: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
