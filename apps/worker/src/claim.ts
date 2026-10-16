import { generationJobs, type Db } from '@insidejoke/db';
import { eq, sql } from 'drizzle-orm';

export type ClaimedJob = typeof generationJobs.$inferSelect;

/**
 * Takes the oldest due job and marks it running. `SKIP LOCKED` lets several worker replicas poll
 * the same table without two of them taking one job. The row is read back through Drizzle so its
 * timestamps come back as dates, not the strings a raw query returns.
 */
export async function claimNextJob(db: Db): Promise<ClaimedJob | null> {
  const claimed = await db.execute<{ id: string }>(sql`
    update ${generationJobs}
    set status = 'running', attempts = attempts + 1, updated_at = now()
    where id = (
      select id from ${generationJobs}
      where status = 'queued' and run_after <= now()
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
