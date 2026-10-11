import type { CSSProperties } from "react";

export const s = {
  line: {
    marginBottom: 18,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 13,
  } satisfies CSSProperties,
  label: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  summary: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  missing: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--warn)",
  } satisfies CSSProperties,
} as const;
