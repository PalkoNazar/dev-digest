/** The index state's `updatedAt` as the "last sync" time; null when the repo was never indexed (epoch 0). */
export function lastSyncDate(updatedAt: string | null | undefined): Date | null {
  if (!updatedAt) return null;
  const d = new Date(updatedAt);
  return Number.isNaN(d.getTime()) || d.getTime() <= 0 ? null : d;
}
