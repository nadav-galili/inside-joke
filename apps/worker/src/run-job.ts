import * as Sentry from '@sentry/node';
import { generationJobs, users, videos, type Db } from '@insidejoke/db';
import { and, eq, ne, sql } from 'drizzle-orm';
import type { ClaimedJob } from './claim.ts';
import { ScriptRefusedError } from './providers/script-writer.ts';
import {
  ConsentWithdrawnError,
  ModerationBlockedError,
  nextStep,
  type StepHandler,
} from './steps.ts';

export const MAX_ATTEMPTS = 3;
/** Wait before a retry, doubling per attempt: 30s, 60s. */
const retryDelaySeconds = (attempts: number) => 30 * 2 ** (attempts - 1);

/** Failures that retrying the same input can't fix. */
const isPermanent = (e: unknown) =>
  e instanceof ScriptRefusedError ||
  e instanceof ConsentWithdrawnError ||
  e instanceof ModerationBlockedError;

/** Tells the creator a paid video is ready or failed. Never throws. */
export type Notify = (videoId: string, outcome: 'ready' | 'failed') => Promise<void>;

export async function runJob(
  db: Db,
  job: ClaimedJob,
  handlers: Record<ClaimedJob['step'], StepHandler>,
  notify: Notify = async () => {},
) {
  const [current] = await db
    .select({ status: videos.status })
    .from(videos)
    .where(eq(videos.id, job.videoId));
  if (current?.status === 'deleted') {
    // The user deleted the video while it was queued: spend nothing more on it.
    await db
      .update(generationJobs)
      .set({ status: 'failed', error: 'video deleted', updatedAt: new Date() })
      .where(eq(generationJobs.id, job.id));
    return;
  }
  try {
    const result = await handlers[job.step](job);
    const live = await db.transaction(async (tx) => {
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
      const updated = await tx
        .update(videos)
        .set({
          ...result.videoUpdate,
          costUsd: sql`${videos.costUsd} + ${result.costUsd}`,
          ...(job.step === 'script' ? { status: 'script_ready' as const } : {}),
          ...(job.step === 'video' ? { status: 'generating' as const } : {}),
          ...(job.step === 'finish' ? { status: 'ready' as const, readyAt: new Date() } : {}),
        })
        // A video the user deleted mid-way stays deleted, and nothing more is spent on it.
        .where(and(eq(videos.id, job.videoId), ne(videos.status, 'deleted')))
        .returning({ id: videos.id });
      const next = nextStep(job.step);
      if (next && updated.length > 0) {
        await tx.insert(generationJobs).values({ videoId: job.videoId, step: next });
      }
      return updated.length > 0;
    });
    if (live && job.step === 'finish') await notify(job.videoId, 'ready');
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`job ${job.id} (${job.step}) failed on attempt ${job.attempts}`, e);
    Sentry.captureException(e, { tags: { step: job.step }, extra: { jobId: job.id } });
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
      const paid = job.step !== 'script';
      await db.transaction(async (tx) => {
        const [video] = await tx
          .update(videos)
          .set({ status: 'failed' })
          .where(and(eq(videos.id, job.videoId), ne(videos.status, 'deleted')))
          .returning();
        if (!video || !paid) return;
        // A paid video that failed is given back: the free one, or a credit for the next.
        await tx
          .update(users)
          .set(
            video.watermarked
              ? { freeVideoUsed: false }
              : { videoCredits: sql`${users.videoCredits} + 1` },
          )
          .where(eq(users.id, video.creatorId));
      });
      if (paid) await notify(job.videoId, 'failed');
    }
  }
}
