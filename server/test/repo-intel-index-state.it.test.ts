import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';

/**
 * `tryGetIndexState().filesLeftOut` — the coverage gap blast maps to `repo_too_large`.
 * Full rows derive it from the walk counters; incremental rows carry it forward.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('RepoIntelRepository.tryGetIndexState — filesLeftOut (Testcontainers)', () => {
  let pg: PgFixture;
  let repo: RepoIntelRepository;
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
    repo = new RepoIntelRepository(db);
  }, 120_000);

  afterAll(async () => {
    await pg?.stop();
  });

  const upsert = (stats: Record<string, unknown>) =>
    repo.upsertIndexState({
      repoId,
      lastIndexedSha: 'sha',
      indexerVersion: 2,
      status: 'full',
      filesIndexed: 10,
      filesSkipped: 4,
      stats,
    });

  it('full row: skippedTooLarge + bounded', async () => {
    await upsert({ skippedTooLarge: 2, bounded: 3, totalCandidates: 100 });
    expect((await repo.tryGetIndexState(repoId))?.filesLeftOut).toBe(5);
  });

  it('incremental row: the carried-forward filesLeftOut wins', async () => {
    await upsert({ incremental: true, filesLeftOut: 5, changedFiles: 1 });
    expect((await repo.tryGetIndexState(repoId))?.filesLeftOut).toBe(5);
  });

  it('nothing left out → 0 (filesSkipped alone, e.g. unsupported languages, does not count)', async () => {
    await upsert({ skippedTooLarge: 0, bounded: 0 });
    expect((await repo.tryGetIndexState(repoId))?.filesLeftOut).toBe(0);
  });
});
