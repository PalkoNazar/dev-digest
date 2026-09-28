import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillModal. */
export const s = {
  body: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    marginBottom: 12,
    borderRadius: 8,
    background: "var(--accent-bg)",
    color: "var(--text-secondary)",
    fontSize: 13,
  } satisfies CSSProperties,
  warn: {
    padding: "10px 14px",
    marginBottom: 12,
    borderRadius: 8,
    background: "var(--warn-bg)",
    color: "var(--warn)",
    fontSize: 13,
  } satisfies CSSProperties,
  row: { display: "flex", gap: 20 } satisfies CSSProperties,
  col: { flex: 1 } satisfies CSSProperties,
  agents: { display: "flex", flexWrap: "wrap", gap: "8px 20px" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
  error: { color: "var(--crit)" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  footerNote: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
