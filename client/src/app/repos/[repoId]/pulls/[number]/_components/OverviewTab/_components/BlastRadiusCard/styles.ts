import type { CSSProperties } from "react";

export const s = {
  section: {
    marginBottom: 24,
  } satisfies CSSProperties,
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: "14px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  stats: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  stat: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  statIcon: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  statValue: {
    color: "var(--text-primary)",
    fontWeight: 700,
  } satisfies CSSProperties,
  statSep: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  notice: {
    border: "1px solid var(--warn)",
    borderRadius: 8,
    background: "var(--warn-bg)",
    padding: "10px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  noticeHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  } satisfies CSSProperties,
  skeleton: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
} as const;
