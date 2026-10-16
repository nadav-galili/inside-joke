import { users, videos, type Db } from '@insidejoke/db';
import { eq } from 'drizzle-orm';
import type { Notify } from './run-job.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const MESSAGES = {
  ready: { title: 'Your video is ready 🎬', body: 'Watch it and send it to the group.' },
  failed: {
    title: "We couldn't make your video",
    body: "You haven't been charged for it. Tap to try again.",
  },
} as const;

/** Sends the creator an Expo push. A failed push is logged, never retried: the app also polls. */
export function expoNotify(db: Db, send: typeof fetch = fetch): Notify {
  return async (videoId, outcome) => {
    try {
      const [row] = await db
        .select({ token: users.expoPushToken })
        .from(videos)
        .innerJoin(users, eq(users.id, videos.creatorId))
        .where(eq(videos.id, videoId));
      if (!row?.token) return;
      const res = await send(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: row.token, ...MESSAGES[outcome], data: { videoId } }),
      });
      if (!res.ok) console.error(`push for video ${videoId} failed: ${res.status}`);
    } catch (e) {
      console.error(`push for video ${videoId} failed`, e);
    }
  };
}
