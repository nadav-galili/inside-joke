import { faces, users, videos, type Db } from '@insidejoke/db';
import { and, eq, isNotNull, isNull, lt, ne } from 'drizzle-orm';
import type { Storage } from './storage.ts';

/** How long pasted chat text is kept for a script nobody approved (privacy policy). */
export const CHAT_TEXT_DAYS = 7;
/**
 * An object nothing points to is deleted once it's this old. The grace covers an upload whose row
 * isn't written yet: a selfie being joined, or a finished video being saved.
 */
export const ORPHAN_GRACE_HOURS = 24;
/** The R2 prefixes that hold people's faces and videos. */
const SWEPT_PREFIXES = ['faces/', 'videos/'];
/** Up to this many orphans are always removed; more than that only while they're a minority. */
const MAX_ORPHANS_WITHOUT_CHECK = 50;

const hoursAgo = (now: Date, hours: number) => new Date(now.getTime() - hours * 3600_000);

export type SweepResult = {
  chatTextCleared: number;
  scriptsCleared: number;
  objectsRemoved: number;
};

/**
 * Deletes personal data the app no longer needs: chat text of scripts left unapproved, the script
 * of a deleted video, and any selfie or video file in R2 that no live row uses (a removed friend's
 * selfie, an abandoned upload, a file left behind by a failed deletion).
 */
export async function sweepExpiredData(
  db: Db,
  storage: Storage,
  now = new Date(),
): Promise<SweepResult> {
  const chat = await db
    .update(videos)
    .set({ inputText: null })
    .where(
      and(isNotNull(videos.inputText), lt(videos.createdAt, hoursAgo(now, CHAT_TEXT_DAYS * 24))),
    )
    .returning({ id: videos.id });
  const scripts = await db
    .update(videos)
    .set({ script: null, inputText: null })
    .where(and(eq(videos.status, 'deleted'), isNotNull(videos.script)))
    .returning({ id: videos.id });

  const inUse = new Set<string>();
  const activeFaces = await db
    .select({ key: faces.r2Key })
    .from(faces)
    .where(isNull(faces.revokedAt));
  const selfies = await db
    .select({ key: users.selfieKey })
    .from(users)
    .where(isNotNull(users.selfieKey));
  const liveVideos = await db
    .select({ key: videos.r2Key })
    .from(videos)
    .where(and(isNotNull(videos.r2Key), ne(videos.status, 'deleted')));
  for (const row of [...activeFaces, ...selfies, ...liveVideos]) if (row.key) inUse.add(row.key);

  const cutoff = hoursAgo(now, ORPHAN_GRACE_HOURS);
  let listed = 0;
  const orphans: string[] = [];
  for (const prefix of SWEPT_PREFIXES) {
    for await (const object of storage.list(prefix)) {
      listed++;
      if (!inUse.has(object.key) && object.modifiedAt <= cutoff) orphans.push(object.key);
    }
  }
  // A worker pointed at the wrong or an empty database would see every file as unused. Orphans
  // are a trickle, so a sweep that would empty most of the bucket stops instead.
  if (orphans.length > MAX_ORPHANS_WITHOUT_CHECK && orphans.length > listed / 2) {
    throw new SweepTooLargeError(orphans.length, listed);
  }
  for (const key of orphans) await storage.remove(key);
  return {
    chatTextCleared: chat.length,
    scriptsCleared: scripts.length,
    objectsRemoved: orphans.length,
  };
}

/** The sweep found most of the bucket unused, which points at a wrong database, not orphans. */
export class SweepTooLargeError extends Error {
  constructor(orphans: number, listed: number) {
    super(`refusing to remove ${orphans} of ${listed} objects; check DATABASE_URL and R2_BUCKET`);
  }
}
