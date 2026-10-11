/* PathText — a repo file path as plain code text, never a link or an Open action (AC-65).
   A path too long for its row is shortened in the middle; the full path stays in the
   tooltip and the accessible name (AC-67). */
import { middleEllipsisPath } from "@/lib/path-ellipsis";
import { PATH_MAX_CHARS } from "../../constants";
import { s } from "./styles";

export function PathText({ path }: { path: string }) {
  const short = middleEllipsisPath(path, PATH_MAX_CHARS);
  if (short === path) {
    return (
      <code className="mono" style={s.path} title={path}>
        {path}
      </code>
    );
  }
  return (
    <code className="mono" style={s.path} title={path}>
      <span aria-hidden="true">{short}</span>
      <span style={s.srOnly}>{path}</span>
    </code>
  );
}
