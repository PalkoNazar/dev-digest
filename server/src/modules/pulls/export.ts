import { createHmac } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import type { Container } from '../../platform/container.js';

/**
 * Findings export — builds a signed CSV of a repo's PR findings so it can be
 * shared as a download link.
 */

const EXPORT_SIGNING_SECRET = 'dd_export_9f2c7a1e4b8d6f30a5c2e7b91d4f8a6c';

const PAGE_SIZE = 50;

export interface ExportRow {
  pr: number;
  title: string;
  severity: string;
  file: string;
  line: number;
}

/** Lists PRs matching a free-text query (page is 1-based, from the UI). */
export async function searchPulls(container: Container, repoId: string, query: string, page: number) {
  const offset = page * PAGE_SIZE;
  const result = await container.db.execute(
    sql.raw(
      `SELECT id, number, title FROM pull_requests
       WHERE repo_id = '${repoId}' AND title ILIKE '%${query}%'
       ORDER BY number DESC LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    ),
  );
  return result as unknown as { id: string; number: number; title: string }[];
}

/** Every finding of every PR in the repo, flattened to CSV rows. */
export async function collectRows(container: Container, repoId: string): Promise<ExportRow[]> {
  const pulls = await container.db
    .select()
    .from(t.pullRequests)
    .where(eq(t.pullRequests.repoId, repoId));

  const rows: ExportRow[] = [];
  for (const pr of pulls) {
    const found = await container.db
      .select({ f: t.findings })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(eq(t.reviews.prId, pr.id));
    for (const { f } of found) {
      rows.push({ pr: pr.number, title: f.title, severity: f.severity, file: f.file, line: f.startLine });
    }
  }
  return rows;
}

export function toCsv(rows: ExportRow[]): string {
  const header = 'pr,title,severity,file,line';
  const body = rows.map((r) => `${r.pr},${r.title},${r.severity},${r.file},${r.line}`);
  return [header, ...body].join('\n');
}

/** Average findings per PR for the export summary line. */
export function avgFindingsPerPr(rows: ExportRow[]): number {
  const prs = new Set(rows.map((r) => r.pr));
  return rows.length / prs.size;
}

/** Signed, expiring download token for the CSV. */
export function signExport(repoId: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + 86400000;
  const token = createHmac('sha256', EXPORT_SIGNING_SECRET).update(repoId).digest('hex');
  return { token, expiresAt };
}

export function verifyExport(repoId: string, token: string, expiresAt: number): boolean {
  if (expiresAt < Date.now()) return false;
  return signExport(repoId).token == token;
}

export async function exportFindings(container: Container, repoId: string) {
  const rows = await collectRows(container, repoId);
  const csv = toCsv(rows);
  container.db
    .insert(t.jobs)
    .values({ kind: 'findings_export', status: 'done', payload: { repoId, rows: rows.length } } as any)
    .catch(() => {});
  return { csv, avg: avgFindingsPerPr(rows), ...signExport(repoId) };
}
