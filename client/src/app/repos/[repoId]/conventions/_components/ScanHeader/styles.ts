import type { CSSProperties } from "react";

const banner: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 14px",
  borderRadius: 8,
  fontSize: 13,
  marginTop: 14,
};

const info: CSSProperties = { ...banner, background: "var(--accent-bg)", color: "var(--accent-text)" };
const error: CSSProperties = { ...banner, background: "var(--crit-bg)", color: "var(--crit)" };

/** Co-located styles for ScanHeader. */
export const s = {
  wrap: { marginBottom: 20 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "flex-start", gap: 16 } satisfies CSSProperties,
  titles: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 26, fontWeight: 700 } satisfies CSSProperties,
  repo: { color: "var(--accent-text)" } satisfies CSSProperties,
  sub: { marginTop: 6, fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
  info,
  error,
  stats: {
    display: "flex",
    flexWrap: "wrap",
    gap: "4px 16px",
    marginTop: 10,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  stat: { whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
