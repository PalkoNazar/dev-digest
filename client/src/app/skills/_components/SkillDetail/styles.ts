import type { CSSProperties } from "react";

/** Co-located styles for SkillDetail (same header/tabs frame as the agent editor). */
export const s = {
  loading: { padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  center: { flex: 1, display: "grid", placeItems: "center" } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 28px 0",
    flexShrink: 0,
  } satisfies CSSProperties,
  icon: { color: "var(--accent)" } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  tabsBar: { marginTop: 14 } satisfies CSSProperties,
  body: { flex: 1, overflow: "auto", padding: 28 } satisfies CSSProperties,
  preview: { maxWidth: 820, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  notice: {
    display: "flex",
    gap: 8,
    padding: "10px 12px",
    marginBottom: 10,
    borderRadius: 7,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    fontSize: 13,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  noticeIcon: { color: "var(--warn)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  label: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  description: { fontSize: 14, lineHeight: 1.5, marginBottom: 10 } satisfies CSSProperties,
  markdown: {
    fontSize: 13,
    padding: "14px 16px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
} as const;
