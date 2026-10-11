/** The "Serializes as" preview (AC-25): the section heading, then one line per attached path, in order. */
export function serializesAs(paths: string[]): string {
  return ["## Project context", ...paths.map((p) => `- ${p}`)].join("\n");
}
