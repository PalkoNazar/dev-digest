import type { CSSProperties } from "react";

/** Co-located styles for ConventionsView. */
export const s = {
  page: { maxWidth: 1040, margin: "0 auto", padding: "32px 28px 60px" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  empty: {
    padding: "28px 0",
    textAlign: "center",
    fontSize: 14,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
