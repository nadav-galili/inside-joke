import { generationJobs, videos } from '@insidejoke/db';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { claimNextJob } from './claim.ts';
import { ScriptRefusedError } from './providers/script-writer.ts';
import { runJob } from './run-job.ts';
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
});
