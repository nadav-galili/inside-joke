import { generationJobs, videos, type Db } from '@insidejoke/db';
import { eq, sql } from 'drizzle-orm';
import type { ClaimedJob } from './claim.ts';
import { ScriptRefusedError } from './providers/script-writer.ts';
import { ConsentWithdrawnError, nextStep, type StepHandler } from './steps.ts';

export const MAX_ATTEMPTS = 3;
/** Wait before a retry, doubling per attempt: 30s, 60s. */
const retryDelaySeconds = (attempts: number) => 30 * 2 ** (attempts - 1);

/** Failures that retrying the same input can't fix. */
const isPermanent = (e: unknown) =>
  e instanceof ScriptRefusedError || e instanceof ConsentWithdrawnError;

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
        .set({
          ...result.videoUpdate,
          costUsd: sql`${videos.costUsd} + ${result.costUsd}`,
          ...(job.step === 'script' ? { status: 'script_ready' as const } : {}),
          ...(job.step === 'video' ? { status: 'generating' as const } : {}),
          ...(job.step === 'finish' ? { status: 'ready' as const, readyAt: new Date() } : {}),
        })
        .where(eq(videos.id, job.videoId));
      const next = nextStep(job.step);
      if (next) await tx.insert(generationJobs).values({ videoId: job.videoId, step: next });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`job ${job.id} (${job.step}) failed on attempt ${job.attempts}`, e);
    const retry = job.attempts < MAX_ATTEMPTS && !isPermanent(e);
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
