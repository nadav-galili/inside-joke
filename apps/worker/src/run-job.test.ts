import { generationJobs, users, videos } from '@insidejoke/db';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { claimNextJob, requeueStaleJobs } from './claim.ts';
import { ScriptRefusedError } from './providers/script-writer.ts';
import { MAX_ATTEMPTS, runJob, type Notify } from './run-job.ts';
import type { StepHandler } from './steps.ts';
import { clearJobs, seedVideo, testDb, testDbUrl } from './test/fixtures.ts';

const ok: StepHandler = async () => ({ output: { ok: true }, costUsd: 0.25 });
const handlers = { script: ok, video: ok, finish: ok };

describe.skipIf(!testDbUrl)('runJob', () => {
  let db: Awaited<ReturnType<typeof testDb>>;
  beforeAll(async () => {
    db = await testDb();
  });
  beforeEach(async () => {
    await clearJobs(db);
  });

  async function claimFor(videoId: string) {
    const job = await claimNextJob(db);
    if (!job || job.videoId !== videoId) throw new Error('expected a job for this video');
    return job;
  }

  it('runs video then finish and marks the video ready', async () => {
    const { video } = await seedVideo(db);
    await db.insert(generationJobs).values({ videoId: video.id, step: 'video' });
    const seen: string[] = [];
    for (let i = 0; i < 2; i++) {
      const job = await claimFor(video.id);
      seen.push(job.step);
      await runJob(db, job, handlers);
    }
    expect(seen).toEqual(['video', 'finish']);
    const [after] = await db.select().from(videos).where(eq(videos.id, video.id));
    expect(after!.status).toBe('ready');
    expect(Number(after!.costUsd)).toBeCloseTo(0.5);
  });

  it('stops after the script and waits for the user', async () => {
    const { video } = await seedVideo(db);
    await db.insert(generationJobs).values({ videoId: video.id, step: 'script' });
    await runJob(db, await claimFor(video.id), handlers);
    const [after] = await db.select().from(videos).where(eq(videos.id, video.id));
    expect(after!.status).toBe('script_ready');
    expect(await claimNextJob(db)).toBeNull();
  });

  it('fails the video at once when the script is refused', async () => {
    const { video } = await seedVideo(db);
    await db.insert(generationJobs).values({ videoId: video.id, step: 'script' });
    const refuse: StepHandler = async () => {
      throw new ScriptRefusedError('no');
    };
    await runJob(db, await claimFor(video.id), { ...handlers, script: refuse });
    const [after] = await db.select().from(videos).where(eq(videos.id, video.id));
    expect(after!.status).toBe('failed');
  });

  it('requeues a failing step with a delay', async () => {
    const { video } = await seedVideo(db);
    await db.insert(generationJobs).values({ videoId: video.id, step: 'video' });
    const boom: StepHandler = async () => {
      throw new Error('provider timeout');
    };
    const job = await claimFor(video.id);
    await runJob(db, job, { ...handlers, video: boom });
    const [retried] = await db.select().from(generationJobs).where(eq(generationJobs.id, job.id));
    expect(retried!.status).toBe('queued');
    expect(retried!.runAfter.getTime()).toBeGreaterThan(Date.now());
    expect(await claimNextJob(db)).toBeNull();
  });

  /** A video at `step` that fails for good on this attempt. */
  async function failForGood(step: 'video' | 'finish', watermarked: boolean, notify: Notify) {
    const { video } = await seedVideo(db);
    await db.update(videos).set({ status: 'paid', watermarked }).where(eq(videos.id, video.id));
    await db.update(users).set({ freeVideoUsed: true }).where(eq(users.id, video.creatorId));
    // Claiming takes the job to its last attempt.
    await db.insert(generationJobs).values({ videoId: video.id, step, attempts: MAX_ATTEMPTS - 1 });
    const job = await claimFor(video.id);
    const boom: StepHandler = async () => {
      throw new Error('provider down');
    };
    await runJob(db, job, { ...handlers, [step]: boom }, notify);
    const [user] = await db.select().from(users).where(eq(users.id, video.creatorId));
    return { video, user: user! };
  }

  it('gives the free video back when it fails, and tells the creator', async () => {
    const told: string[] = [];
    const { user } = await failForGood('video', true, async (_id, outcome) => {
      told.push(outcome);
    });
    expect(user.freeVideoUsed).toBe(false);
    expect(user.videoCredits).toBe(0);
    expect(told).toEqual(['failed']);
  });

  it('gives a credit back when a paid video fails', async () => {
    const { user } = await failForGood('finish', false, async () => {});
    expect(user.freeVideoUsed).toBe(true);
    expect(user.videoCredits).toBe(1);
  });

  it('tells the creator when the video is ready', async () => {
    const { video } = await seedVideo(db);
    await db.insert(generationJobs).values({ videoId: video.id, step: 'finish' });
    const told: string[] = [];
    await runJob(db, await claimFor(video.id), handlers, async (id, outcome) => {
      told.push(`${id}:${outcome}`);
    });
    expect(told).toEqual([`${video.id}:ready`]);
  });

  it('leaves a deleted video deleted and spends nothing more on it', async () => {
    const { video } = await seedVideo(db);
    await db.update(videos).set({ status: 'deleted' }).where(eq(videos.id, video.id));
    await db.insert(generationJobs).values({ videoId: video.id, step: 'video' });
    let ran = false;
    const spend: StepHandler = async () => {
      ran = true;
      return { output: {}, costUsd: 1 };
    };
    await runJob(db, await claimFor(video.id), { ...handlers, video: spend });
    const [after] = await db.select().from(videos).where(eq(videos.id, video.id));
    expect(after!.status).toBe('deleted');
    expect(ran).toBe(false);
    expect(await claimNextJob(db)).toBeNull();
  });

  it('requeues a job its worker left running, keeping the paid request to resume', async () => {
    const { video } = await seedVideo(db);
    const [orphan] = await db
      .insert(generationJobs)
      .values({
        videoId: video.id,
        step: 'video',
        status: 'running',
        attempts: 1,
        requestId: 'req_paid',
      })
      .returning();
    await db
      .update(generationJobs)
      .set({ updatedAt: sql`now() - interval '10 minutes'` })
      .where(eq(generationJobs.id, orphan!.id));
    const [alive] = await db
      .insert(generationJobs)
      .values({ videoId: video.id, step: 'finish', status: 'running', attempts: 1 })
      .returning();

    expect(await requeueStaleJobs(db, 120)).toEqual([orphan!.id]);
    const job = await claimFor(video.id);
    expect(job.id).toBe(orphan!.id);
    expect(job.requestId).toBe('req_paid');
    expect(job.attempts).toBe(2);
    const [untouched] = await db
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, alive!.id));
    expect(untouched!.status).toBe('running');
  });

  it('starts a fresh provider request after a failure instead of resuming the failed one', async () => {
    const { video } = await seedVideo(db);
    await db.insert(generationJobs).values({ videoId: video.id, step: 'video' });
    const job = await claimFor(video.id);
    await db
      .update(generationJobs)
      .set({ requestId: 'req_failed' })
      .where(eq(generationJobs.id, job.id));
    const boom: StepHandler = async () => {
      throw new Error('fal request failed');
    };
    await runJob(db, job, { ...handlers, video: boom });
    const [after] = await db.select().from(generationJobs).where(eq(generationJobs.id, job.id));
    expect(after!.status).toBe('queued');
    expect(after!.requestId).toBeNull();
  });

  it("ignores a presumed-dead worker's late result once its job was taken over", async () => {
    const { video } = await seedVideo(db);
    await db.insert(generationJobs).values({ videoId: video.id, step: 'video' });
    const stale = await claimFor(video.id);
    // Another worker requeued and claimed it meanwhile.
    await db
      .update(generationJobs)
      .set({ attempts: stale.attempts + 1 })
      .where(eq(generationJobs.id, stale.id));
    await runJob(db, stale, handlers);
    const [after] = await db.select().from(videos).where(eq(videos.id, video.id));
    expect(after!.status).toBe('draft');
    expect(await claimNextJob(db)).toBeNull();
  });

  it('gives up and refunds a job that keeps taking its worker down', async () => {
    const { video } = await seedVideo(db);
    await db
      .update(videos)
      .set({ status: 'paid', watermarked: false })
      .where(eq(videos.id, video.id));
    await db
      .insert(generationJobs)
      .values({ videoId: video.id, step: 'video', attempts: MAX_ATTEMPTS });
    let ran = false;
    const spend: StepHandler = async () => {
      ran = true;
      return { output: {}, costUsd: 1 };
    };
    await runJob(db, await claimFor(video.id), { ...handlers, video: spend });
    expect(ran).toBe(false);
    const [after] = await db.select().from(videos).where(eq(videos.id, video.id));
    expect(after!.status).toBe('failed');
    const [user] = await db.select().from(users).where(eq(users.id, video.creatorId));
    expect(user!.videoCredits).toBe(1);
  });
});
