import { generationJobs, users, videos } from '@insidejoke/db';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { claimNextJob } from './claim.ts';
import { DEFAULT_DAILY_SPEND_LIMIT_USD, dailySpendLimit, spentInLastDay } from './budget.ts';
import { clearJobs, seedVideo, testDb, testDbUrl } from './test/fixtures.ts';

describe('dailySpendLimit', () => {
  it('reads the limit and falls back to the default', () => {
    expect(dailySpendLimit('120')).toBe(120);
    expect(dailySpendLimit('0')).toBe(0);
    expect(dailySpendLimit(undefined)).toBe(DEFAULT_DAILY_SPEND_LIMIT_USD);
    expect(dailySpendLimit('')).toBe(DEFAULT_DAILY_SPEND_LIMIT_USD);
    expect(dailySpendLimit('lots')).toBe(DEFAULT_DAILY_SPEND_LIMIT_USD);
    expect(dailySpendLimit('-5')).toBe(DEFAULT_DAILY_SPEND_LIMIT_USD);
  });
});

describe.skipIf(!testDbUrl)('spentInLastDay', () => {
  let db: Awaited<ReturnType<typeof testDb>>;
  beforeAll(async () => {
    db = await testDb();
  });
  beforeEach(async () => {
    await clearJobs(db);
  });

  it('adds up the finished steps of the last 24 hours only', async () => {
    const { video } = await seedVideo(db);
    const dayAndABitAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await db.insert(generationJobs).values([
      { videoId: video.id, step: 'script', status: 'done', costUsd: '0.30' },
      { videoId: video.id, step: 'video', status: 'done', costUsd: '0.75' },
      { videoId: video.id, step: 'video', status: 'queued', costUsd: '0' },
      { videoId: video.id, step: 'video', status: 'done', costUsd: '9', updatedAt: dayAndABitAgo },
    ]);
    expect(await spentInLastDay(db)).toBeCloseTo(1.05);
  });

  it('is zero with nothing done', async () => {
    expect(await spentInLastDay(db)).toBe(0);
  });
});

describe.skipIf(!testDbUrl)('claimNextJob while over budget', () => {
  let db: Awaited<ReturnType<typeof testDb>>;
  beforeAll(async () => {
    db = await testDb();
  });
  beforeEach(async () => {
    await clearJobs(db);
  });

  it("only takes paying customers' work", async () => {
    const free = (await seedVideo(db)).video;
    const bought = (await seedVideo(db)).video;
    const credited = (await seedVideo(db)).video;
    await db.update(videos).set({ watermarked: false }).where(eq(videos.id, bought.id));
    await db.update(users).set({ videoCredits: 1 }).where(eq(users.id, credited.creatorId));
    await db.insert(generationJobs).values([
      { videoId: free.id, step: 'script' },
      { videoId: free.id, step: 'video' },
      { videoId: bought.id, step: 'finish' },
      { videoId: credited.id, step: 'script' },
    ]);
    const taken = [];
    for (let job; (job = await claimNextJob(db, { paidOnly: true }));) {
      taken.push([job.videoId, job.step]);
    }
    expect(taken).toEqual(
      expect.arrayContaining([
        [bought.id, 'finish'],
        [credited.id, 'script'],
      ]),
    );
    expect(taken).toHaveLength(2);
    expect(await claimNextJob(db)).not.toBeNull();
  });
});
