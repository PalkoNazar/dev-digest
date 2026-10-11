import type { CSSProperties } from "react";

/** Co-located styles for SkillContextTab (design 03). */
export const s = {
  wrap: { maxWidth: 1000, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  tokens: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  label: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  serialized: {
    margin: 0,
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--code-bg)",
    fontSize: 12.5,
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,
} as const;
