import type { BlastCaller } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";

/** GitHub blob link to a caller's line, or null (render plain text) without a repo or SHA. */
export function callerHref(
  repoFullName: string | null,
  sha: string | null,
  caller: BlastCaller,
): string | null {
  if (!repoFullName || !sha) return null;
  return githubBlobUrl(repoFullName, sha, caller.file, caller.line);
}
