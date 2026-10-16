import {
  createDb,
  generationJobs,
  groups,
  runMigrations,
  users,
  videos,
  type Db,
} from '@insidejoke/db';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { claimNextJob } from './claim.ts';
import { runJob } from './run-job.ts';
import { steps, type StepHandler } from './steps.ts';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('worker jobs', () => {
  let db: Db;
  beforeAll(async () => {
    db = createDb(url!);
    await runMigrations(db);
  });

  async function newVideo() {
    const [user] = await db.insert(users).values({ clerkUserId: crypto.randomUUID() }).returning();
    const [group] = await db
      .insert(groups)
      .values({ ownerId: user!.id, name: 'Poker', inviteCode: crypto.randomUUID() })
      .returning();
    const [video] = await db
      .insert(videos)
      .values({ groupId: group!.id, creatorId: user!.id, style: 'telenovela' })
      .returning();
    return video!;
  }

  const ok: StepHandler = async () => ({ output: { ok: true }, costUsd: 0.25 });

  it('runs keyframes, clips and stitch in order and marks the video ready', async () => {
    const video = await newVideo();
    await db.insert(generationJobs).values({ videoId: video.id, step: 'keyframes' });
    const handlers = { script: ok, keyframes: ok, clips: ok, stitch: ok };
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const job = await claimNextJob(db);
      if (!job || job.videoId !== video.id) throw new Error('expected a job for this video');
      seen.push(job.step);
      await runJob(db, job, handlers);
    }
    expect(seen).toEqual(['keyframes', 'clips', 'stitch']);
    const [after] = await db.select().from(videos).where(eq(videos.id, video.id));
    expect(after!.status).toBe('ready');
    expect(Number(after!.costUsd)).toBeCloseTo(0.75);
  });

  it('stops after the script and waits for the user', async () => {
    const video = await newVideo();
    await db.insert(generationJobs).values({ videoId: video.id, step: 'script' });
    const job = await claimNextJob(db);
    await runJob(db, job!, { ...steps, script: ok });
    const [after] = await db.select().from(videos).where(eq(videos.id, video.id));
    expect(after!.status).toBe('script_ready');
    expect(await claimNextJob(db)).toBeNull();
  });

  it('fails the video at once when a step is not implemented', async () => {
    const video = await newVideo();
    await db.insert(generationJobs).values({ videoId: video.id, step: 'clips' });
    const job = await claimNextJob(db);
    await runJob(db, job!, steps);
    const [after] = await db.select().from(videos).where(eq(videos.id, video.id));
    expect(after!.status).toBe('failed');
  });

  it('requeues a failing step with a delay until it runs out of attempts', async () => {
    const video = await newVideo();
    await db.insert(generationJobs).values({ videoId: video.id, step: 'clips' });
    const boom: StepHandler = async () => {
      throw new Error('provider timeout');
    };
    const job = await claimNextJob(db);
    await runJob(db, job!, { ...steps, clips: boom });
    const [retried] = await db.select().from(generationJobs).where(eq(generationJobs.id, job!.id));
    expect(retried!.status).toBe('queued');
    expect(retried!.runAfter.getTime()).toBeGreaterThan(Date.now());
    expect(await claimNextJob(db)).toBeNull();
  });
});
