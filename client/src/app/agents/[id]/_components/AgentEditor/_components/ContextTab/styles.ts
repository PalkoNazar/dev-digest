import type { CSSProperties } from "react";

/** Co-located styles for the agent ContextTab (design 02). */
export const s = {
  wrap: { maxWidth: 1000, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
    borderTop: "1px solid var(--border)",
    fontSize: 13,
  } satisfies CSSProperties,
  note: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
