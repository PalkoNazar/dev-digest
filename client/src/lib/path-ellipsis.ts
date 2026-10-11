/** Shortens a long repo path in the MIDDLE so its start and its file name stay visible
 *  (`.claude/skills/…/relations.md`), unlike a CSS end-ellipsis (L05 AC-43 rows).
 *  The file name is never cut; whole leading directory segments are kept while they fit
 *  in `max` characters. A path that already fits, or a bare file name, is returned as is. */
export function middleEllipsisPath(path: string, max: number): string {
  if (path.length <= max) return path;
  const cut = path.lastIndexOf("/");
  if (cut < 0) return path;
  const dir = path.slice(0, cut);
  const file = path.slice(cut + 1);
  // Characters left for the directory part of `<head>…/<file>`.
  const room = max - file.length - 2;
  if (room < MIN_HEAD) return `…/${file}`;
  let head = "";
  for (const seg of dir.split("/")) {
    const next = head ? `${head}/${seg}` : seg;
    if (next.length + 1 > room) break;
    head = next;
  }
  // No whole first segment fits → keep as much of its start as fits.
  return head ? `${head}/…/${file}` : `${dir.slice(0, room)}…/${file}`;
}

/** Below this many characters a directory stub says nothing — show `…/<file>` instead. */
const MIN_HEAD = 4;
