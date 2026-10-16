import { generationJobs, users, videos } from '@insidejoke/db';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { claimNextJob } from './claim.ts';
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
    await db.insert(generationJobs).values({ videoId: video.id, step });
    const job = await claimFor(video.id);
    const boom: StepHandler = async () => {
      throw new Error('provider down');
    };
    await runJob(db, { ...job, attempts: MAX_ATTEMPTS }, { ...handlers, [step]: boom }, notify);
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
});
