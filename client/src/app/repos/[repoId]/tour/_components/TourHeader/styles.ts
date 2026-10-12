import type { CSSProperties } from "react";

/** Co-located styles for TourHeader. */
export const s = {
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 } satisfies CSSProperties,
  text: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 } satisfies CSSProperties,
  title: { margin: 0, fontSize: 26, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" } satisfies CSSProperties,
  repo: { color: "var(--accent-text)", fontFamily: "var(--font-mono)" } satisfies CSSProperties,
  meta: { margin: 0, fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
} as const;
