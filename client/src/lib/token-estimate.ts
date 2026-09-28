/** Rough token count for editors (≈ 4 chars per token; the run trace has the exact one). */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
