import { faces, videos } from '@insidejoke/db';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { SweepTooLargeError, sweepExpiredData } from './retention.ts';
import type { Storage } from './storage.ts';
import { sampleScript, seedVideo, testDb, testDbUrl } from './test/fixtures.ts';

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 3600_000);

/** An in-memory bucket holding the given keys, written at the given time. */
function fakeBucket(objects: Record<string, Date>) {
  const removed: string[] = [];
  const storage: Storage = {
    readUrl: async (key) => key,
    uploadFile: async () => {},
    remove: async (key) => {
      removed.push(key);
    },
    async *list(prefix) {
      for (const [key, modifiedAt] of Object.entries(objects)) {
        if (key.startsWith(prefix)) yield { key, modifiedAt };
      }
    },
  };
  return { storage, removed };
}

describe.skipIf(!testDbUrl)('sweepExpiredData', () => {
  let db: Awaited<ReturnType<typeof testDb>>;
  beforeAll(async () => {
    db = await testDb();
  });

  it('clears chat text a week after it was pasted, and the script of a deleted video', async () => {
    const { video: stale } = await seedVideo(db);
    await db
      .update(videos)
      .set({ createdAt: daysAgo(8) })
      .where(eq(videos.id, stale.id));
    const { video: fresh } = await seedVideo(db);
    const { video: gone, cast } = await seedVideo(db);
    await db
      .update(videos)
      .set({ status: 'deleted', script: sampleScript(cast) })
      .where(eq(videos.id, gone.id));

    await sweepExpiredData(db, fakeBucket({}).storage);

    const text = async (id: string) =>
      (await db.select().from(videos).where(eq(videos.id, id)))[0]!;
    expect((await text(stale.id)).inputText).toBeNull();
    expect((await text(fresh.id)).inputText).not.toBeNull();
    expect((await text(gone.id)).script).toBeNull();
  });

  it('removes files no live row uses once they are a day old', async () => {
    const { video, cast } = await seedVideo(db);
    // The first friend was removed from the group; the second still stars.
    await db.update(faces).set({ revokedAt: new Date() }).where(eq(faces.memberId, cast[0]!.id));
    await db
      .update(videos)
      .set({ status: 'ready', r2Key: `videos/${video.id}.mp4` })
      .where(eq(videos.id, video.id));
    const removedFace = `faces/${cast[0]!.id}.jpg`;
    const keptFace = `faces/${cast[1]!.id}.jpg`;
    const abandoned = `faces/join/${crypto.randomUUID()}.jpg`;
    const uploading = `faces/join/${crypto.randomUUID()}.jpg`;
    const { storage, removed } = fakeBucket({
      [removedFace]: daysAgo(2),
      [keptFace]: daysAgo(2),
      [abandoned]: daysAgo(2),
      [uploading]: new Date(),
      [`videos/${video.id}.mp4`]: daysAgo(2),
      'other/unrelated.txt': daysAgo(30),
    });

    const result = await sweepExpiredData(db, storage);

    expect(removed.sort()).toEqual([abandoned, removedFace].sort());
    expect(result.objectsRemoved).toBe(2);
  });

  it('refuses to empty a bucket the database knows nothing about', async () => {
    const objects = Object.fromEntries(
      Array.from({ length: 8 }, () => [`videos/${crypto.randomUUID()}.mp4`, daysAgo(2)]),
    );
    const { storage, removed } = fakeBucket(objects);
    await expect(sweepExpiredData(db, storage)).rejects.toBeInstanceOf(SweepTooLargeError);
    expect(removed).toEqual([]);
  });
});
