import type { CSSProperties } from "react";

const card = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--bg-elevated)",
  padding: 18,
  minWidth: 0,
} satisfies CSSProperties;

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  headerRight: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  card: { ...card, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  empty: { ...card, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 } satisfies CSSProperties,
  emptyTitle: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  emptyHint: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  summary: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,
  meta: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 10,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  notices: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--warn-bg)",
    padding: "8px 12px",
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  noticesTitle: { fontWeight: 600, color: "var(--warn)", marginBottom: 4 } satisfies CSSProperties,
  noticeList: { margin: 0, paddingLeft: 18 } satisfies CSSProperties,
  removed: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  error: {
    ...card,
    borderColor: "var(--crit)",
    background: "var(--crit-bg)",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
  } satisfies CSSProperties,
  errorText: { flex: 1, minWidth: 0, fontSize: 13, color: "var(--text-primary)" } satisfies CSSProperties,
  errorTitle: { fontWeight: 600, marginRight: 6 } satisfies CSSProperties,
  skeleton: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  /** Intent + Risk areas | Blast radius. */
  columns: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 16,
    alignItems: "start",
  } satisfies CSSProperties,
  /** The intent/blast slots bring their own cards; the column only stacks them. */
  column: { display: "flex", flexDirection: "column", minWidth: 0 } satisfies CSSProperties,
} as const;
