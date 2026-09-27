import type { CSSProperties } from "react";

/** Co-located styles for SkillEditor (same frame as the agent ConfigTab). */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  version: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  enabled: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  bodyTabs: { display: "flex", gap: 6 } satisfies CSSProperties,
  preview: {
    minHeight: 200,
    fontSize: 13,
    padding: "12px 14px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  error: { color: "var(--crit)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 10 } satisfies CSSProperties,
  deleteWrap: { marginLeft: "auto" } satisfies CSSProperties,
} as const;
