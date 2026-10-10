import type { CSSProperties } from "react";

export const s = {
  item: {
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "10px 0",
    background: "none",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    color: "var(--text-primary)",
    font: "inherit",
  } satisfies CSSProperties,
  chevron: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  symbol: {
    fontSize: 13,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  count: {
    marginLeft: "auto",
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  body: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "0 0 12px 22px",
  } satisfies CSSProperties,
  callers: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  caller: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    fontSize: 12.5,
    minWidth: 0,
  } satisfies CSSProperties,
  arrow: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  link: {
    color: "var(--accent)",
    textDecoration: "none",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  location: {
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  callerName: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  chipsBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  chipsLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  } satisfies CSSProperties,
} as const;
