import { generationJobs, users, videos, type Db } from '@insidejoke/db';
import { and, eq, sql } from 'drizzle-orm';

export type ClaimedJob = typeof generationJobs.$inferSelect;

/**
 * Takes the oldest due job and marks it running. `SKIP LOCKED` lets several worker replicas poll
 * the same table without two of them taking one job. The row is read back through Drizzle so its
 * timestamps come back as dates, not the strings a raw query returns.
 *
 * With `paidOnly`, only paying customers' work is taken: filming and finishing a bought video, and
 * scripts for someone holding a credit. That is what the spend breaker keeps going.
 */
export async function claimNextJob(
  db: Db,
  { paidOnly = false }: { paidOnly?: boolean } = {},
): Promise<ClaimedJob | null> {
  const paidFilter = paidOnly
    ? sql`and exists (
        select 1 from ${videos} join ${users} on ${users.id} = ${videos.creatorId}
        where ${videos.id} = ${generationJobs.videoId} and (
          (${generationJobs.step} in ('video', 'finish') and not ${videos.watermarked})
          or (${generationJobs.step} = 'script' and ${users.videoCredits} > 0)
        )
      )`
    : sql``;
  const claimed = await db.execute<{ id: string }>(sql`
    update ${generationJobs}
    set status = 'running', attempts = attempts + 1, updated_at = now()
    where id = (
      select id from ${generationJobs}
      where status = 'queued' and run_after <= now() ${paidFilter}
      order by run_after
      for update skip locked
      limit 1
    )
    returning id
  `);
  const id = claimed[0]?.id;
  if (!id) return null;
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, id));
  return job ?? null;
}

/** How often a running job is touched, so the reaper can tell it from an orphan. */
export const HEARTBEAT_MS = 30_000;
/** A running job untouched this long lost its worker: a few missed heartbeats, to allow for lag. */
export const STALE_AFTER_SECONDS = 120;
/** How often a worker looks for jobs a stopped worker left running. */
export const REAP_MS = 60_000;

/**
 * Matches the job only while this run still owns it: running, at this attempt. If the job was
 * requeued because its worker looked dead, the old run's late writes must not count.
 */
export const ownedByRun = (job: Pick<ClaimedJob, 'id' | 'attempts'>) =>
  and(
    eq(generationJobs.id, job.id),
    eq(generationJobs.status, 'running'),
    eq(generationJobs.attempts, job.attempts),
  );

/** Marks the job as alive. The database's clock, like the reaper's, so worker clock skew is moot. */
export async function touchJob(db: Db, job: Pick<ClaimedJob, 'id' | 'attempts'>) {
  await db
    .update(generationJobs)
    .set({ updatedAt: sql`now()` })
    .where(ownedByRun(job));
}

/**
 * Puts back jobs whose worker stopped mid-way (a redeploy or a crash). A live worker touches its
 * job every `HEARTBEAT_MS`, so a running job that hasn't been touched for longer is orphaned. Its
 * `request_id` stays, so a video step resumes the take it already paid for.
 */
export async function requeueStaleJobs(db: Db, staleAfterSeconds: number): Promise<string[]> {
  const requeued = await db.execute<{ id: string }>(sql`
    update ${generationJobs}
    set status = 'queued', run_after = now(), updated_at = now()
    where status = 'running' and updated_at < now() - make_interval(secs => ${staleAfterSeconds})
    returning id
  `);
  return requeued.map((r) => r.id);
}
