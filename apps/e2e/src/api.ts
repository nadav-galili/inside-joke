import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { generationJobs, users, videoCast, videos, type Db } from '@insidejoke/db';
import {
  AI_CONSENT_VERSION,
  FACE_CONSENT_VERSION,
  type GroupSummary,
  type Script,
  type UploadTarget,
} from '@insidejoke/shared';
import { desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { createApp } from '../../api/src/app.ts';
import type { VerifyToken } from '../../api/src/auth.ts';
import type { Storage } from '../../api/src/storage.ts';
import type { DeleteAuthUser } from '../../api/src/users.ts';

/** A plain colour square: the stand-in face for seeded selfies and friends. */
const FACE = readFileSync(new URL('../fixtures/face.jpg', import.meta.url));

/** Storage in memory, served by this API, so no test photo ever reaches R2. */
function memoryStorage(publicUrl: string) {
  const files = new Map<string, Buffer>();
  const url = (key: string) => `${publicUrl}/__e2e/files/${encodeURIComponent(key)}`;
  const storage: Storage = {
    uploadUrl: async (key) => url(key),
    readUrl: async (key) => url(key),
    exists: async (key) => files.has(key),
    remove: async (key) => {
      files.delete(key);
    },
  };
  return { storage, files };
}

/**
 * The real API on a local database and in-memory storage, plus `/__e2e/*` routes the tests use to
 * do what a person or the worker would: seed a selfie, have friends join, write a script. The
 * worker never runs, so no script or video is ever generated and nothing is paid for.
 *
 * The control routes upload faces for people who never took them, so they live here only and must
 * never be mounted in `apps/api`.
 */
export function createE2eApi(
  db: Db,
  opts: {
    publicUrl: string;
    verifyToken: VerifyToken;
    /** The Clerk user id a test signed up in the app with this email, or null before sign-up. */
    findClerkUser: (email: string) => Promise<string | null>;
    deleteAuthUser: DeleteAuthUser;
  },
): Hono {
  const { storage, files } = memoryStorage(opts.publicUrl);
  // Lets the control routes call the API as a user; random per run, never leaves this process.
  const internal = `e2e-${randomUUID()}:`;
  const unlimited = { requests: 1_000_000, windowMs: 60_000 };
  const api = createApp(db, {
    verifyToken: async (t) =>
      t.startsWith(internal) ? t.slice(internal.length) : opts.verifyToken(t),
    storage,
    publicUrl: opts.publicUrl,
    revenueCatWebhookAuth: `Bearer ${randomUUID()}`,
    rateLimits: { public: unlimited, user: unlimited },
    deleteAuthUser: opts.deleteAuthUser,
    supportEmail: 'support@insidejoke.test',
    dataController: 'Inside Joke e2e',
  });

  async function call<T>(clerkId: string | null, method: string, path: string, body?: unknown) {
    const res = await api.request(path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(clerkId ? { authorization: `Bearer ${internal}${clerkId}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  async function clerkIdFor(email: string) {
    const id = await opts.findClerkUser(email);
    if (!id) throw new Error(`no Clerk user with ${email}`);
    return id;
  }

  /** The API's row for the user, once the app has called the API as them. */
  async function userFor(email: string) {
    const clerkId = await opts.findClerkUser(email);
    if (!clerkId) return undefined;
    const [user] = await db.select().from(users).where(eq(users.clerkUserId, clerkId));
    return user;
  }

  const app = new Hono();

  app.put('/__e2e/files/:key', async (c) => {
    files.set(c.req.param('key'), Buffer.from(await c.req.arrayBuffer()));
    return c.body(null, 200);
  });
  app.get('/__e2e/files/:key', (c) => {
    const file = files.get(c.req.param('key'));
    if (!file) return c.notFound();
    return c.body(new Uint8Array(file), 200, { 'content-type': 'image/jpeg' });
  });

  /** Whether the app has reached this API as the user, and where they are in onboarding. */
  app.get('/__e2e/users/:email', async (c) => {
    const user = await userFor(c.req.param('email'));
    return c.json({
      seen: !!user,
      aiConsented: !!user?.aiConsentVersion,
      hasSelfie: !!user?.selfieKey,
    });
  });

  /** The user's selfie, as the selfie screen would save it. */
  app.post('/__e2e/users/:email/selfie', async (c) => {
    const clerkId = await clerkIdFor(c.req.param('email'));
    const target = await call<UploadTarget>(clerkId, 'POST', '/me/selfie/upload-url');
    files.set(target.key, FACE);
    await call(clerkId, 'POST', '/me/selfie', {
      key: target.key,
      consentTextVersion: FACE_CONSENT_VERSION,
    });
    return c.json({ ok: true });
  });

  /** Friends join the user's newest group from the web invite page, each with a selfie. */
  app.post('/__e2e/users/:email/friends', async (c) => {
    const clerkId = await clerkIdFor(c.req.param('email'));
    const { names } = await c.req.json<{ names: string[] }>();
    const [group] = await call<GroupSummary[]>(clerkId, 'GET', '/groups');
    if (!group) throw new Error('the user has no group');
    const code = group.inviteUrl.split('/join/')[1];
    for (const displayName of names) {
      const target = await call<UploadTarget>(null, 'POST', `/join/${code}/upload-url`);
      files.set(target.key, FACE);
      await call(null, 'POST', `/join/${code}`, {
        displayName,
        key: target.key,
        consentTextVersion: FACE_CONSENT_VERSION,
        aiConsentVersion: AI_CONSENT_VERSION,
        adult: true,
      });
    }
    return c.json({ groupId: group.id });
  });

  /** Does the worker's script step for the user's newest video, without calling Claude. */
  app.post('/__e2e/users/:email/script', async (c) => {
    const user = await userFor(c.req.param('email'));
    if (!user) throw new Error('the user has not reached the API');
    const [video] = await db
      .select()
      .from(videos)
      .where(eq(videos.creatorId, user.id))
      .orderBy(desc(videos.createdAt))
      .limit(1);
    if (!video) throw new Error('the user has no video');
    const cast = await db.select().from(videoCast).where(eq(videoCast.videoId, video.id));
    const script: Script = {
      title: 'The Group Chat',
      premise: 'Nobody admits who ate the last slice.',
      setting: 'A kitchen at midnight',
      cast: cast.map((m, i) => ({
        memberId: m.memberId,
        role: `SUSPECT ${i + 1}`,
        direction: 'Avoids eye contact.',
      })),
      beats: [
        {
          fromSecond: 0,
          toSecond: 7,
          action: 'An empty pizza box.',
          speakerRole: null,
          line: '',
          subtitle: '',
        },
        {
          fromSecond: 7,
          toSecond: 15,
          action: 'Everyone points at someone else.',
          speakerRole: 'SUSPECT 1',
          line: 'It was already gone.',
          subtitle: 'It was already gone.',
        },
      ],
      subtitleLanguage: 'en',
    };
    await db.update(videos).set({ status: 'script_ready', script }).where(eq(videos.id, video.id));
    return c.json({ videoId: video.id });
  });

  /** Every generation job for the user's videos: the tests check none was ever claimed. */
  app.get('/__e2e/users/:email/jobs', async (c) => {
    const user = await userFor(c.req.param('email'));
    if (!user) return c.json([]);
    const mine = db.select({ id: videos.id }).from(videos).where(eq(videos.creatorId, user.id));
    const jobs = await db
      .select({ step: generationJobs.step, status: generationJobs.status })
      .from(generationJobs)
      .where(inArray(generationJobs.videoId, mine));
    return c.json(jobs);
  });

  app.route('/', api);
  return app;
}
