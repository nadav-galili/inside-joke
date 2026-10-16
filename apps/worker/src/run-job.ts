import { generationJobs, videos, type Db } from '@insidejoke/db';
import { eq, sql } from 'drizzle-orm';
import type { ClaimedJob } from './claim.ts';
import { nextStep, StepNotImplementedError, type StepHandler } from './steps.ts';

export const MAX_ATTEMPTS = 3;
/** Wait before a retry, doubling per attempt: 30s, 60s. */
const retryDelaySeconds = (attempts: number) => 30 * 2 ** (attempts - 1);

export async function runJob(
  db: Db,
  job: ClaimedJob,
  handlers: Record<ClaimedJob['step'], StepHandler>,
) {
  try {
    const result = await handlers[job.step](job);
    await db.transaction(async (tx) => {
      await tx
        .update(generationJobs)
        .set({
          status: 'done',
          output: result.output,
          costUsd: String(result.costUsd),
          provider: result.provider ?? null,
          model: result.model ?? null,
          requestId: result.requestId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(generationJobs.id, job.id));
      await tx
        .update(videos)
        .set({ costUsd: sql`${videos.costUsd} + ${result.costUsd}` })
        .where(eq(videos.id, job.videoId));
      const next = nextStep(job.step);
      if (next) await tx.insert(generationJobs).values({ videoId: job.videoId, step: next });
      if (job.step === 'script') {
        await tx.update(videos).set({ status: 'script_ready' }).where(eq(videos.id, job.videoId));
      }
      if (job.step === 'stitch') {
        await tx
          .update(videos)
          .set({ status: 'ready', readyAt: new Date() })
          .where(eq(videos.id, job.videoId));
      }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`job ${job.id} (${job.step}) failed on attempt ${job.attempts}`, e);
    const retry = job.attempts < MAX_ATTEMPTS && !(e instanceof StepNotImplementedError);
    await db
      .update(generationJobs)
      .set({
        status: retry ? 'queued' : 'failed',
        error: message,
        runAfter: retry
          ? new Date(Date.now() + retryDelaySeconds(job.attempts) * 1000)
          : job.runAfter,
        updatedAt: new Date(),
      })
      .where(eq(generationJobs.id, job.id));
    if (!retry) {
      await db.update(videos).set({ status: 'failed' }).where(eq(videos.id, job.videoId));
    }
  }
}
