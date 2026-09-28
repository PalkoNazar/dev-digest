import type { CSSProperties } from "react";

/** Co-located styles for CandidatesToolbar. */
export const s = {
  bar: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 16 } satisfies CSSProperties,
  chips: { display: "flex", gap: 6 } satisfies CSSProperties,
  count: { marginLeft: "auto", fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
