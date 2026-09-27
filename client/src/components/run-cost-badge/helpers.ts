/**
 * USD cost for display (L01). Unknown cost is "—", never "$0.00" — a run whose
 * model has no price must not read as free. Precision grows as the amount
 * shrinks so cheap runs stay distinguishable: $1.23 · $0.014 · $0.0013.
 */
export function formatUsd(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  if (usd === 0) return "$0";
  if (usd < 0.0001) return "<$0.0001"; // would otherwise round to "$0.00"
  const digits = usd >= 1 ? 2 : usd >= 0.01 ? 3 : 4;
  // Trim trailing zeros beyond cents: 0.060 → $0.06, but 1.20 stays $1.20.
  return `$${usd.toFixed(digits).replace(/(\.\d\d\d*?)0+$/, "$1")}`;
}

/** Total tokens (in + out) with thousands separators, e.g. 9,119; null when neither is known. */
export function totalTokens(tokensIn: number | null | undefined, tokensOut: number | null | undefined): string | null {
  if (tokensIn == null && tokensOut == null) return null;
  return ((tokensIn ?? 0) + (tokensOut ?? 0)).toLocaleString("en-US");
}
