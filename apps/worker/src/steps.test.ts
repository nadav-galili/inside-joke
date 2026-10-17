import { faces, generationJobs, users, videos } from '@insidejoke/db';
import { eq, sql } from 'drizzle-orm';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { claimNextJob, requeueStaleJobs, STALE_AFTER_SECONDS } from './claim.ts';
import type { VideoRequest } from './providers/video-generator.ts';
import { videoSize } from './render.ts';
import { runJob } from './run-job.ts';
import { createSteps } from './steps.ts';
import type { Storage } from './storage.ts';
import { clearJobs, sampleScript, seedVideo, testDb, testDbUrl } from './test/fixtures.ts';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

describe.skipIf(!testDbUrl || !hasFfmpeg)('the pipeline with fake providers', () => {
  let db: Awaited<ReturnType<typeof testDb>>;
  let dir: string;
  let rawVideo: string;
  beforeAll(async () => {
    db = await testDb();
    dir = await mkdtemp(path.join(tmpdir(), 'steps-test-'));
    rawVideo = path.join(dir, 'raw.mp4');
    // A 2-second vertical test clip with sound, standing in for the fal output.
    const made = spawnSync('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=432x768:rate=24:duration=2',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      rawVideo,
    ]);
    if (made.status !== 0) throw new Error(made.stderr.toString());
  });
  beforeEach(async () => {
    await clearJobs(db);
  });

  it('writes the script, generates with faces in cast order, and stores the finished video', async () => {
    const { video, cast } = await seedVideo(db);
    const uploaded = new Map<string, string>();
    const storage: Storage = {
      readUrl: async (key) => `https://r2.test/${key}`,
      uploadFile: async (key, file) => {
        const copy = path.join(dir, key.replace(/\//g, '_'));
        await copyFile(file, copy);
        uploaded.set(key, copy);
      },
      remove: async () => {},
      list: async function* () {},
    };
    const requests: VideoRequest[] = [];
    const moderated: string[] = [];
    // The script casts the second member first, to prove Image 1 follows the script's order.
    const script = sampleScript([cast[1]!, cast[0]!]);
    const steps = createSteps(db, {
      writeScript: async (input) => {
        expect(input.cast.map((c) => c.displayName).sort()).toEqual(['Dani', 'Ziv']);
        return { script, costUsd: 0.05, model: 'test-llm', requestId: 'msg_1' };
      },
      generateVideo: async (req) => {
        requests.push(req);
        return {
          videoUrl: 'https://fal.test/v.mp4',
          costUsd: 0.75,
          model: 'test-video',
          requestId: 'req_1',
        };
      },
      storage,
      moderate: async (frames) => {
        moderated.push(...frames);
        return { safe: true, reason: 'fine', costUsd: 0.01, model: 'test-mod' };
      },
      moderateScript: async () => ({ safe: true, reason: 'fine', costUsd: 0, model: 'm' }),
      download: async (_url, file) => copyFile(rawVideo, file),
    });

    await db.insert(generationJobs).values({ videoId: video.id, step: 'script' });
    await runJob(db, (await claimNextJob(db))!, steps);
    let [row] = await db.select().from(videos).where(eq(videos.id, video.id));
    expect(row!.status).toBe('script_ready');
    expect(row!.script?.title).toBe('All In');

    // Payment queues the video step (the API does this in phase 3).
    await db.insert(generationJobs).values({ videoId: video.id, step: 'video' });
    await runJob(db, (await claimNextJob(db))!, steps);
    expect(requests[0]!.referenceImageUrls).toEqual([
      `https://r2.test/faces/${cast[1]!.id}.jpg`,
      `https://r2.test/faces/${cast[0]!.id}.jpg`,
    ]);
    expect(requests[0]!.prompt).toContain('THE GAMBLER is the person in Image 1');

    await runJob(db, (await claimNextJob(db))!, steps);
    [row] = await db.select().from(videos).where(eq(videos.id, video.id));
    expect(row!.status).toBe('ready');
    expect(row!.r2Key).toBe(`videos/${video.id}.mp4`);
    expect(Number(row!.costUsd)).toBeCloseTo(0.81);
    expect(moderated).toHaveLength(4);
    const final = uploaded.get(`videos/${video.id}.mp4`)!;
    expect(await videoSize(final)).toEqual({ width: 432, height: 768 });
  });

  it('fails the video without retrying when a cast member withdraws consent', async () => {
    const { video, cast } = await seedVideo(db);
    await db
      .update(videos)
      .set({ script: sampleScript(cast) })
      .where(eq(videos.id, video.id));
    await db.update(faces).set({ revokedAt: new Date() }).where(eq(faces.memberId, cast[0]!.id));
    let called = false;
    const steps = createSteps(db, {
      writeScript: async () => {
        throw new Error('unused');
      },
      generateVideo: async () => {
        called = true;
        throw new Error('should not be called');
      },
      storage: {
        readUrl: async (k) => k,
        uploadFile: async () => {},
        remove: async () => {},
        list: async function* () {},
      },
      moderate: async () => ({ safe: true, reason: '', costUsd: 0, model: 'm' }),
      moderateScript: async () => ({ safe: true, reason: 'fine', costUsd: 0, model: 'm' }),
    });
    await db.insert(generationJobs).values({ videoId: video.id, step: 'video' });
    await runJob(db, (await claimNextJob(db))!, steps);
    const [row] = await db.select().from(videos).where(eq(videos.id, video.id));
    expect(called).toBe(false);
    expect(row!.status).toBe('failed');
  });

  it('records the fal request as soon as it starts, and resumes it after a worker restart', async () => {
    const { video, cast } = await seedVideo(db);
    await db
      .update(videos)
      .set({ script: sampleScript(cast) })
      .where(eq(videos.id, video.id));
    const requests: VideoRequest[] = [];
    let recorded: string | null | undefined;
    const steps = createSteps(db, {
      writeScript: async () => {
        throw new Error('unused');
      },
      generateVideo: async (req) => {
        requests.push(req);
        const requestId = req.resumeRequestId ?? 'req_new';
        if (!req.resumeRequestId) {
          await req.onSubmitted?.(requestId);
          const [row] = await db
            .select()
            .from(generationJobs)
            .where(eq(generationJobs.videoId, video.id));
          recorded = row!.requestId;
          throw new Error('worker stopped');
        }
        return { videoUrl: 'https://fal.test/v.mp4', costUsd: 0.75, model: 'm', requestId };
      },
      storage: {
        readUrl: async (k) => k,
        uploadFile: async () => {},
        remove: async () => {},
        list: async function* () {},
      },
      moderate: async () => ({ safe: true, reason: '', costUsd: 0, model: 'm' }),
      moderateScript: async () => ({ safe: true, reason: 'fine', costUsd: 0, model: 'm' }),
    });
    await db.insert(generationJobs).values({ videoId: video.id, step: 'video' });
    const first = (await claimNextJob(db))!;
    await expect(steps.video(first)).rejects.toThrow('worker stopped');
    expect(recorded).toBe('req_new');

    // The worker died: once the job looks stale, the reaper puts it back with its request.
    await db
      .update(generationJobs)
      .set({ updatedAt: sql`now() - interval '10 minutes'` })
      .where(eq(generationJobs.id, first.id));
    expect(await requeueStaleJobs(db, STALE_AFTER_SECONDS)).toEqual([first.id]);
    await runJob(db, (await claimNextJob(db))!, steps);
    expect(requests.map((r) => r.resumeRequestId ?? null)).toEqual([null, 'req_new']);
    const [row] = await db.select().from(videos).where(eq(videos.id, video.id));
    expect(row!.status).toBe('generating');
  });

  it('never delivers a video that fails moderation', async () => {
    const { video, cast } = await seedVideo(db);
    await db
      .update(videos)
      .set({ script: sampleScript(cast), status: 'generating' })
      .where(eq(videos.id, video.id));
    await db.insert(generationJobs).values({
      videoId: video.id,
      step: 'video',
      status: 'done',
      output: { videoUrl: 'https://fal.test/v.mp4' },
    });
    let uploaded = false;
    const steps = createSteps(db, {
      writeScript: async () => {
        throw new Error('unused');
      },
      generateVideo: async () => {
        throw new Error('unused');
      },
      storage: {
        readUrl: async (k) => k,
        uploadFile: async () => {
          uploaded = true;
        },
        remove: async () => {},
        list: async function* () {},
      },
      moderate: async () => ({ safe: false, reason: 'gore', costUsd: 0.01, model: 'm' }),
      moderateScript: async () => ({ safe: true, reason: 'fine', costUsd: 0, model: 'm' }),
      download: async (_url, file) => copyFile(rawVideo, file),
    });
    await db.insert(generationJobs).values({ videoId: video.id, step: 'finish' });
    await runJob(db, (await claimNextJob(db))!, steps);
    const [row] = await db.select().from(videos).where(eq(videos.id, video.id));
    expect(uploaded).toBe(false);
    expect(row!.status).toBe('failed');
    expect(await claimNextJob(db)).toBeNull();
  });

  it('never films a script that fails the words check, and gives the credit back', async () => {
    const { video, cast } = await seedVideo(db);
    await db
      .update(videos)
      .set({ script: sampleScript(cast), status: 'paid', watermarked: false })
      .where(eq(videos.id, video.id));
    let filmed = false;
    const steps = createSteps(db, {
      writeScript: async () => {
        throw new Error('unused');
      },
      generateVideo: async () => {
        filmed = true;
        throw new Error('should not be called');
      },
      storage: {
        readUrl: async (k) => k,
        uploadFile: async () => {},
        remove: async () => {},
        list: async function* () {},
      },
      moderate: async () => ({ safe: true, reason: '', costUsd: 0, model: 'm' }),
      moderateScript: async () => ({ safe: false, reason: 'a slur', costUsd: 0, model: 'm' }),
    });
    await db.insert(generationJobs).values({ videoId: video.id, step: 'video' });
    await runJob(db, (await claimNextJob(db))!, steps);
    const [row] = await db.select().from(videos).where(eq(videos.id, video.id));
    const [creator] = await db.select().from(users).where(eq(users.id, video.creatorId));
    expect(filmed).toBe(false);
    expect(row!.status).toBe('failed');
    expect(creator!.videoCredits).toBe(1);
    expect(await claimNextJob(db)).toBeNull();
  });
});
