import type { CSSProperties } from "react";

/** Co-located styles for SkillBodyField (same file bar as the SkillEditor). */
export const s = {
  fileBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    marginBottom: -1,
    borderRadius: "7px 7px 0 0",
    border: "1px solid var(--border-strong)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  fileName: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  tokens: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  preview: {
    minHeight: 200,
    maxHeight: 420,
    overflow: "auto",
    fontSize: 13,
    padding: "12px 14px",
    borderRadius: "0 0 7px 7px",
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  error: { color: "var(--crit)" } satisfies CSSProperties,
} as const;
