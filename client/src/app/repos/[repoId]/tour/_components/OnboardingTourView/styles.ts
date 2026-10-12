import type { CSSProperties } from "react";

/** Co-located styles for OnboardingTourView. */
export const s = {
  page: {
    maxWidth: 1040,
    margin: "0 auto",
    padding: "32px 28px 60px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  } satisfies CSSProperties,
  layout: {
    maxWidth: 1240,
    margin: "0 auto",
    padding: "32px 28px 60px",
    display: "grid",
    gridTemplateColumns: "220px minmax(0, 1fr)",
    gap: 40,
  } satisfies CSSProperties,
  main: { display: "flex", flexDirection: "column", gap: 20, minWidth: 0 } satisfies CSSProperties,
  loading: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    paddingBottom: 40,
    border: "1px dashed var(--border)",
    borderRadius: 10,
  } satisfies CSSProperties,
  emptyList: {
    margin: "10px 0 0",
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
} as const;
