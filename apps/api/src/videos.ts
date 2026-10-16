import { createVideoSchema } from '@insidejoke/shared';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AuthVariables } from './auth.ts';
import {
  faces,
  generationJobs,
  groups,
  members,
  users,
  videoCast,
  videos,
  type Db,
} from '@insidejoke/db';

export function videoRoutes(db: Db) {
  const app = new Hono<{ Variables: AuthVariables }>();

  /**
   * Creates a draft video and queues its script. The cast must be members of the group with a face
   * they consented to.
   */
  app.post('/', async (c) => {
    const parsed = createVideoSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
    const { groupId, inputText, style, castMemberIds } = parsed.data;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, c.get('clerkUserId')));
    if (!user) return c.json({ error: 'unknown_user' }, 404);

    const [group] = await db
      .select()
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.ownerId, user.id)));
    if (!group) return c.json({ error: 'group_not_found' }, 404);

    const consented = await db
      .select({ memberId: members.id })
      .from(members)
      .innerJoin(faces, and(eq(faces.memberId, members.id), isNull(faces.revokedAt)))
      .where(and(eq(members.groupId, groupId), inArray(members.id, castMemberIds)));
    const consentedIds = new Set(consented.map((r) => r.memberId));
    const missing = castMemberIds.filter((id) => !consentedIds.has(id));
    if (missing.length > 0) return c.json({ error: 'cast_without_consent', missing }, 409);

    const video = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(videos)
        .values({ groupId, creatorId: user.id, inputText, style })
        .returning();
      if (!created) throw new Error('video insert returned no row');
      await tx
        .insert(videoCast)
        .values(castMemberIds.map((memberId) => ({ videoId: created.id, memberId })));
      // The script is written before payment so the user can approve it first.
      await tx.insert(generationJobs).values({ videoId: created.id, step: 'script' });
      return created;
    });
    return c.json({ id: video.id, status: video.status }, 201);
  });

  app.get('/:id', async (c) => {
    const [row] = await db
      .select({ video: videos })
      .from(videos)
      .innerJoin(users, eq(users.id, videos.creatorId))
      .where(and(eq(videos.id, c.req.param('id')), eq(users.clerkUserId, c.get('clerkUserId'))));
    if (!row) return c.json({ error: 'not_found' }, 404);
    // The raw chat text never leaves the server once it's been sent.
    return c.json({ ...row.video, inputText: undefined });
  });

  return app;
}
