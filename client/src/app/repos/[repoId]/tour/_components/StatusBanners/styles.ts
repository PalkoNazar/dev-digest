import type { CSSProperties } from "react";

export type Tone = "info" | "warn" | "error";

const TONE_COLORS: Record<Tone, { color: string; bg: string }> = {
  info: { color: "var(--info)", bg: "var(--info-bg)" },
  warn: { color: "var(--warn)", bg: "var(--warn-bg)" },
  error: { color: "var(--crit)", bg: "var(--crit-bg)" },
};

/** A banner box; the tone adds colour on top of the text, never in place of it. */
export function toneStyle(tone: Tone): CSSProperties {
  const { color, bg } = TONE_COLORS[tone];
  return {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "10px 14px",
    borderRadius: 8,
    border: `1px solid ${color}`,
    background: bg,
    fontSize: 13.5,
    color: "var(--text-primary)",
    lineHeight: 1.5,
  };
}

/** Co-located styles for StatusBanners. */
export const s = {
  stack: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  icon: { flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  text: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  link: { color: "var(--accent-text)", textDecoration: "underline" } satisfies CSSProperties,
  detail: { marginTop: 4, fontSize: 12.5, color: "var(--text-secondary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  code: { fontSize: 12.5 } satisfies CSSProperties,
  staleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } satisfies CSSProperties,
} as const;
