/** A document's leading YAML frontmatter block, split from its Markdown body (L05 AC-3 preview).
 *  Only a file that STARTS with a `---` line and has a later closing `---` line has one;
 *  anything else (no opener, unclosed block, a `---` rule further down) is all body. */
export function splitFrontmatter(text: string): { frontmatter: string | null; body: string } {
  const open = /^---\r?\n/.exec(text);
  if (!open) return { frontmatter: null, body: text };
  const rest = text.slice(open[0].length);
  const close = /^---[ \t]*(?:\r?\n|$)/m.exec(rest);
  if (!close) return { frontmatter: null, body: text };
  return {
    frontmatter: rest.slice(0, close.index).replace(/\r?\n$/, ""),
    body: rest.slice(close.index + close[0].length),
  };
}
