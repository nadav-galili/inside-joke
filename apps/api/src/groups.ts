import {
  createGroupSchema,
  type GroupDetail,
  type GroupSummary,
  type VideoSummary,
} from '@insidejoke/shared';
import { and, count, desc, eq, isNull, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AuthVariables } from './auth.ts';
import { faces, groups, members, videos, type Db } from '@insidejoke/db';
import { currentUser } from './users.ts';

/** An unguessable code for the invite link. */
export const newInviteCode = () =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(9))).toString('base64url');

export function groupRoutes(db: Db, publicUrl: string) {
  const app = new Hono<{ Variables: AuthVariables }>();
  const inviteUrl = (code: string) => `${publicUrl}/join/${code}`;

  async function ownedGroup(clerkUserId: string, groupId: string) {
    const user = await currentUser(db, clerkUserId);
    const [group] = await db
      .select()
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.ownerId, user.id)));
    return { user, group };
  }

  app.get('/', async (c) => {
    const user = await currentUser(db, c.get('clerkUserId'));
    const rows = await db
      .select({ group: groups, memberCount: count(members.id) })
      .from(groups)
      .leftJoin(members, eq(members.groupId, groups.id))
      .where(eq(groups.ownerId, user.id))
      .groupBy(groups.id)
      .orderBy(desc(groups.createdAt));
    const list: GroupSummary[] = rows.map((r) => ({
      id: r.group.id,
      name: r.group.name,
      memberCount: r.memberCount,
      inviteUrl: inviteUrl(r.group.inviteCode),
    }));
    return c.json(list);
  });

  /** Creates a group with its owner as the first member, starring their selfie if they have one. */
  app.post('/', async (c) => {
    const parsed = createGroupSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const user = await currentUser(db, c.get('clerkUserId'));
    const group = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(groups)
        .values({ ownerId: user.id, name: parsed.data.name, inviteCode: newInviteCode() })
        .returning();
      if (!created) throw new Error('group insert returned no row');
      const [owner] = await tx
        .insert(members)
        .values({
          groupId: created.id,
          userId: user.id,
          displayName: parsed.data.myName,
          inviteStatus: 'joined',
        })
        .returning();
      if (user.selfieKey && user.selfieConsentVersion) {
        await tx.insert(faces).values({
          memberId: owner!.id,
          r2Key: user.selfieKey,
          consentTextVersion: user.selfieConsentVersion,
        });
      }
      return created;
    });
    const summary: GroupSummary = {
      id: group.id,
      name: group.name,
      memberCount: 1,
      inviteUrl: inviteUrl(group.inviteCode),
    };
    return c.json(summary, 201);
  });

  app.get('/:id', async (c) => {
    const { user, group } = await ownedGroup(c.get('clerkUserId'), c.req.param('id'));
    if (!group) return c.json({ error: 'not_found' }, 404);
    const rows = await db
      .select({ member: members, faceId: faces.id })
      .from(members)
      .leftJoin(faces, and(eq(faces.memberId, members.id), isNull(faces.revokedAt)))
      .where(and(eq(members.groupId, group.id), ne(members.inviteStatus, 'left')))
      .orderBy(members.createdAt);
    const detail: GroupDetail = {
      id: group.id,
      name: group.name,
      memberCount: rows.length,
      inviteUrl: inviteUrl(group.inviteCode),
      members: rows.map((r) => ({
        id: r.member.id,
        displayName: r.member.displayName,
        hasFace: r.faceId !== null,
        isMe: r.member.userId === user.id,
      })),
    };
    return c.json(detail);
  });

  /** The owner removes someone from the group; their face can no longer be cast. */
  app.delete('/:id/members/:memberId', async (c) => {
    const { user, group } = await ownedGroup(c.get('clerkUserId'), c.req.param('id'));
    if (!group) return c.json({ error: 'not_found' }, 404);
    const [member] = await db
      .select()
      .from(members)
      .where(and(eq(members.id, c.req.param('memberId')), eq(members.groupId, group.id)));
    if (!member) return c.json({ error: 'not_found' }, 404);
    if (member.userId === user.id) return c.json({ error: 'cannot_remove_owner' }, 400);
    await db.transaction(async (tx) => {
      await tx.update(members).set({ inviteStatus: 'left' }).where(eq(members.id, member.id));
      await tx
        .update(faces)
        .set({ revokedAt: new Date() })
        .where(and(eq(faces.memberId, member.id), isNull(faces.revokedAt)));
    });
    return c.json({ ok: true });
  });

  app.get('/:id/videos', async (c) => {
    const { user, group } = await ownedGroup(c.get('clerkUserId'), c.req.param('id'));
    if (!group) return c.json({ error: 'not_found' }, 404);
    const rows = await db
      .select()
      .from(videos)
      .where(
        and(
          eq(videos.groupId, group.id),
          eq(videos.creatorId, user.id),
          ne(videos.status, 'deleted'),
        ),
      )
      .orderBy(desc(videos.createdAt));
    const list: VideoSummary[] = rows.map((v) => ({
      id: v.id,
      groupId: v.groupId,
      status: v.status,
      style: v.style,
      title: v.script?.title ?? null,
      createdAt: v.createdAt.toISOString(),
    }));
    return c.json(list);
  });

  return app;
}
