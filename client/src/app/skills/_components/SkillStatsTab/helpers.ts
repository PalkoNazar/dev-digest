/** 0..1 → "71"; null (no data) stays null so the tile can show "—". */
export function toPercent(value: number | null): number | null {
  return value == null ? null : Math.round(value * 100);
}
