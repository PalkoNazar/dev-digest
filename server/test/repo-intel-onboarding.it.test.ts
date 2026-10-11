import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';

/**
 * SPEC-02 AC-70 (Q7-A) — `RepoIntel.getImporterCounts` over the real `file_edges`
 * table: distinct importing files per path, scoped to the repo, 0 for a path no
 * file imports. (`file_edges` has a (repo, from, to) PK, so a duplicate edge can't
 * be stored; the dedupe is covered by the unit test in repo-intel-blast.test.ts.)
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('RepoIntel.getImporterCounts (Testcontainers)', () => {
  let pg: PgFixture;
  let svc: RepoIntelService;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    const { db } = pg.handle;
    const { workspaceId } = await seed(db);
    const [row] = await db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
    repoId = row!.id;
    const [other] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'other', fullName: 'acme/other' })
      .returning();
    await db.insert(t.fileEdges).values([
      { repoId, fromFile: 'src/a.ts', toFile: 'src/c.ts' },
      { repoId, fromFile: 'src/b.ts', toFile: 'src/c.ts' },
      { repoId: other!.id, fromFile: 'src/x.ts', toFile: 'src/c.ts' },
    ]);
    // Same constructor shape as the sibling facade tests (the service takes the container).
    svc = new RepoIntelService({ config: { repoIntelEnabled: true }, db } as never);
  }, 120_000);

  afterAll(async () => {
    await pg?.stop();
  });

  it("counts this repo's distinct importers only; an unimported path maps to 0", async () => {
    await expect(svc.getImporterCounts(repoId, ['src/c.ts', 'src/a.ts'])).resolves.toEqual({
      'src/c.ts': 2,
      'src/a.ts': 0,
    });
  });
});
