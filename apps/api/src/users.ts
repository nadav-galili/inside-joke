import {
  AI_CONSENT_VERSION,
  aiConsentSchema,
  pushTokenSchema,
  recordSelfieSchema,
  type Me,
} from '@insidejoke/shared';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AuthVariables } from './auth.ts';
import { faces, groups, members, users, videos, type Db } from '@insidejoke/db';
import { newSelfieKey, userSelfiePrefix, type Storage } from './storage.ts';

export type User = typeof users.$inferSelect;

/** The signed-in user's row, created on their first request. */
export async function currentUser(db: Db, clerkUserId: string): Promise<User> {
  const [existing] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
  if (existing) return existing;
  await db.insert(users).values({ clerkUserId }).onConflictDoNothing();
  const [created] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
  if (!created) throw new Error('user insert returned no row');
  return created;
}

/** Deletes the sign-in account itself, once the user's data is gone. */
export type DeleteAuthUser = (clerkUserId: string) => Promise<void>;

export function meRoutes(db: Db, storage: Storage, deleteAuthUser: DeleteAuthUser) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.get('/', async (c) => {
    const user = await currentUser(db, c.get('clerkUserId'));
    const me: Me = {
      id: user.id,
      // An older consent doesn't count: the app asks again whenever the text changes.
      aiConsented: user.aiConsentVersion === AI_CONSENT_VERSION,
      hasSelfie: user.selfieKey !== null,
      selfieUrl: user.selfieKey ? await storage.readUrl(user.selfieKey) : null,
      freeVideoUsed: user.freeVideoUsed,
      videoCredits: user.videoCredits,
    };
    return c.json(me);
  });

  app.post('/ai-consent', async (c) => {
    const parsed = aiConsentSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const user = await currentUser(db, c.get('clerkUserId'));
    await db
      .update(users)
      .set({ aiConsentVersion: parsed.data.version })
      .where(eq(users.id, user.id));
    return c.json({ ok: true });
  });

  app.post('/push-token', async (c) => {
    const parsed = pushTokenSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const user = await currentUser(db, c.get('clerkUserId'));
    await db.update(users).set({ expoPushToken: parsed.data.token }).where(eq(users.id, user.id));
    return c.json({ ok: true });
  });

  /** A signed upload link for the user's own selfie. */
  app.post('/selfie/upload-url', async (c) => {
    const user = await currentUser(db, c.get('clerkUserId'));
    const key = newSelfieKey(userSelfiePrefix(user.id));
    return c.json({ key, uploadUrl: await storage.uploadUrl(key) });
  });

  /**
   * Records the uploaded selfie with the user's consent and puts it on every group they're in,
   * replacing an older selfie.
   */
  app.post('/selfie', async (c) => {
    const parsed = recordSelfieSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const { key, consentTextVersion } = parsed.data;
    const user = await currentUser(db, c.get('clerkUserId'));
    // Only a key from this user's own upload link: nobody can attach someone else's photo.
    if (!key.startsWith(userSelfiePrefix(user.id))) return c.json({ error: 'invalid_key' }, 400);
    if (!(await storage.exists(key))) return c.json({ error: 'not_uploaded' }, 400);

    const old = user.selfieKey;
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ selfieKey: key, selfieConsentVersion: consentTextVersion })
        .where(eq(users.id, user.id));
      const mine = await tx
        .select({ id: members.id })
        .from(members)
        .where(eq(members.userId, user.id));
      const memberIds = mine.map((m) => m.id);
      if (memberIds.length === 0) return;
      await tx
        .update(faces)
        .set({ revokedAt: new Date() })
        .where(and(inArray(faces.memberId, memberIds), isNull(faces.revokedAt)));
      await tx
        .insert(faces)
        .values(memberIds.map((memberId) => ({ memberId, r2Key: key, consentTextVersion })));
    });
    if (old && old !== key) await storage.remove(old);
    return c.json({ ok: true });
  });

  /** Withdraws consent: the selfie is deleted and can't be used in any new video. */
  app.delete('/selfie', async (c) => {
    const user = await currentUser(db, c.get('clerkUserId'));
    if (!user.selfieKey) return c.json({ ok: true });
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ selfieKey: null, selfieConsentVersion: null })
        .where(eq(users.id, user.id));
      await tx
        .update(faces)
        .set({ revokedAt: new Date() })
        .where(and(eq(faces.r2Key, user.selfieKey!), isNull(faces.revokedAt)));
    });
    await storage.remove(user.selfieKey);
    return c.json({ ok: true });
  });

  /**
   * Deletes the account and everything it made (guideline 5.1.1(v)): the user's selfie, their
   * groups with the friends' selfies in them, and every video, then the sign-in account.
   */
  app.delete('/', async (c) => {
    const clerkUserId = c.get('clerkUserId');
    const user = await currentUser(db, clerkUserId);
    const keys = await db.transaction(async (tx) => {
      const groupIds = tx.select({ id: groups.id }).from(groups).where(eq(groups.ownerId, user.id));
      const faceKeys = await tx
        .select({ key: faces.r2Key })
        .from(faces)
        .innerJoin(members, eq(members.id, faces.memberId))
        .where(inArray(members.groupId, groupIds));
      const videoKeys = await tx
        .select({ key: videos.r2Key })
        .from(videos)
        .where(eq(videos.creatorId, user.id));
      // Groups, members, faces, videos, jobs and purchases go with the user row.
      await tx.delete(users).where(eq(users.id, user.id));
      return [user.selfieKey, ...faceKeys.map((r) => r.key), ...videoKeys.map((r) => r.key)];
    });
    // The rows are gone, so a failed removal can't be retried: log it and carry on.
    const unique = [...new Set(keys.filter((k): k is string => k !== null))];
    const removed = await Promise.allSettled(unique.map((key) => storage.remove(key)));
    for (const r of removed)
      if (r.status === 'rejected') console.error('orphaned object', r.reason);
    await deleteAuthUser(clerkUserId);
    return c.json({ ok: true });
  });

  return app;
}
