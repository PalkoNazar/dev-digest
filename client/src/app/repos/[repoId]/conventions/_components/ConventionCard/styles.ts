import type { CSSProperties } from "react";
import type { ConventionCandidate } from "@devdigest/shared";

const STRIPE: Record<ConventionCandidate["status"], string> = {
  pending: "var(--border-strong)",
  accepted: "var(--ok)",
  rejected: "var(--crit)",
};

/** Co-located styles for ConventionCard (mockup: left stripe, actions column on the right). */
export const s = {
  card: (status: ConventionCandidate["status"]): CSSProperties => ({
    display: "flex",
    gap: 20,
    padding: "18px 20px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    borderLeft: `3px solid ${STRIPE[status]}`,
    background: "var(--bg-surface)",
    opacity: status === "rejected" ? 0.6 : 1,
  }),
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  meta: { display: "flex", flexWrap: "wrap", gap: 6 } satisfies CSSProperties,
  ruleRow: { display: "flex", alignItems: "flex-start", gap: 8 } satisfies CSSProperties,
  rule: { flex: 1, fontSize: 15, fontWeight: 600, fontStyle: "italic", lineHeight: 1.4 } satisfies CSSProperties,
  editRow: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  editActions: { display: "flex", gap: 8 } satisfies CSSProperties,
  evidence: {
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-primary)",
    overflow: "hidden",
  } satisfies CSSProperties,
  evidenceBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "4px 6px 4px 12px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  evidencePath: { flex: 1, fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  more: { fontSize: 12, color: "var(--text-muted)", cursor: "help" } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "10px 12px",
    fontSize: 12.5,
    lineHeight: 1.6,
    overflowX: "auto",
    whiteSpace: "pre",
  } satisfies CSSProperties,
  scoreRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 } satisfies CSSProperties,
  scoreLabel: { color: "var(--text-muted)" } satisfies CSSProperties,
  bar: { width: 140 } satisfies CSSProperties,
  pct: { color: "var(--text-secondary)" } satisfies CSSProperties,
  adherence: { color: "var(--text-muted)", marginLeft: 6 } satisfies CSSProperties,
  actions: { width: 150, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
} as const;
