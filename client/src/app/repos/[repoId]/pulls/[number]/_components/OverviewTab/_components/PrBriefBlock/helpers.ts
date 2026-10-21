/* Pure helpers for the PR Brief block: staleness, the verdict banner's review,
   input notices, file refs and the changed-file check. No React, no I/O. */
import type {
  BriefInputNote,
  PrBriefResponse,
  ReviewRecord,
  RunSummary,
  Verdict,
} from "@devdigest/shared";
import { SHORT_SHA_LEN } from "./constants";

/** Stale when the server says so, or when the polled PR head moved past the brief's
    commit since it was read (the brief query itself is not polled). Never triggers a POST. */
export function isBriefStale(
  data: PrBriefResponse | undefined,
  currentHeadSha: string | null | undefined,
): boolean {
  if (!data?.brief) return false;
  if (data.stale) return true;
  return !!currentHeadSha && data.brief.run.head_sha !== currentHeadSha;
}

export interface BannerReview {
  verdict: Verdict;
  score: number | null;
  findingsCount: number;
  blockers: number;
  agentName: string | null;
}

/** The latest completed review for the verdict banner: verdict + score from the newest
    `kind='review'` record with a verdict, findings/blockers from its run (joined by `run_id`). */
export function latestCompletedReview(
  reviews: ReviewRecord[] | undefined,
  runs: RunSummary[] | undefined,
): BannerReview | null {
  const latest = (reviews ?? [])
    .filter((r) => r.kind === "review" && r.verdict != null)
    .reduce<ReviewRecord | null>((best, r) => (!best || r.created_at > best.created_at ? r : best), null);
  if (!latest?.verdict) return null;
  const run = latest.run_id ? (runs ?? []).find((r) => r.run_id === latest.run_id) : undefined;
  return {
    verdict: latest.verdict,
    score: latest.score ?? run?.score ?? null,
    findingsCount: run?.findings_count ?? latest.findings.length,
    blockers: run?.blockers ?? 0,
    agentName: latest.agent_name ?? run?.agent_name ?? null,
  };
}

export interface NoticeKey {
  /** `notice.input.<input>` */
  input: string;
  /** `notice.reason.<reason>` */
  reason: string;
  ref: string | null;
}

/** Message keys for each input note, in server order, de-duplicated. */
export function noticeKeys(inputs: BriefInputNote[]): NoticeKey[] {
  const seen = new Set<string>();
  const out: NoticeKey[] = [];
  for (const n of inputs) {
    const ref = n.ref ?? null;
    const id = `${n.input}|${n.reason}|${ref ?? ""}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ input: `notice.input.${n.input}`, reason: `notice.reason.${n.reason}`, ref });
  }
  return out;
}

export function shortSha(sha: string): string {
  return sha.slice(0, SHORT_SHA_LEN);
}

/** A risk file ref `path`, `path:12` or `path:12-18` → path + first line. */
export function parseFileRef(ref: string): { path: string; line: number | null } {
  const m = /^(.*?):(\d+)(?:-\d+)?$/.exec(ref);
  if (!m || !m[1]) return { path: ref, line: null };
  const line = Number(m[2]);
  return { path: m[1], line: line > 0 ? line : null };
}

/** Whether a path is one of the PR's changed files (exact match). */
export function isChangedFile(path: string, changedFiles: readonly string[]): boolean {
  return changedFiles.includes(path);
}
