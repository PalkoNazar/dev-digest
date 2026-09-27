import type { CSSProperties } from "react";

/** Co-located styles for SkillEditorView. */
export const s = {
  page: { padding: "20px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  back: {
    display: "inline-block",
    fontSize: 13,
    color: "var(--text-muted)",
    marginBottom: 16,
    textDecoration: "none",
  } satisfies CSSProperties,
  loading: { display: "flex", flexDirection: "column", gap: 16, maxWidth: 760 } satisfies CSSProperties,
} as const;
