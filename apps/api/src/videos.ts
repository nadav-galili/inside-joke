import {
  AI_CONSENT_VERSION,
  createVideoSchema,
  MAX_SCRIPT_ATTEMPTS,
  MAX_SCRIPTS_PER_DAY,
  updateScriptSchema,
  type ApproveResult,
  type GenerationStep,
  type Script,
  type VideoDetail,
} from '@insidejoke/shared';
import { and, count, eq, gt, inArray, isNull, ne, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AuthVariables } from './auth.ts';
import {
  faces,
  generationJobs,
  groups,
  members,
  oneDayAgo,
  users,
  videoCast,
  videos,
  type Db,
} from '@insidejoke/db';
import type { Storage } from './storage.ts';
import { currentUser } from './users.ts';

type Video = typeof videos.$inferSelect;

/** The edits a user may make to a script: words only, never the cast or the timing. */
function sameShape(a: Script, b: Script): boolean {
  const castIds = (s: Script) =>
    s.cast
      .map((c) => c.memberId)
      .sort()
      .join();
  const timing = (s: Script) => s.beats.map((x) => `${x.fromSecond}-${x.toSecond}`).join();
  return castIds(a) === castIds(b) && timing(a) === timing(b);
}

export function videoRoutes(db: Db, storage: Storage, freeVideosPerDay: number) {
  const app = new Hono<{ Variables: AuthVariables }>();

  async function ownVideo(clerkUserId: string, id: string) {
    const user = await currentUser(db, clerkUserId);
    const [video] = await db
      .select()
      .from(videos)
      .where(and(eq(videos.id, id), eq(videos.creatorId, user.id), ne(videos.status, 'deleted')));
    return { user, video };
  }

  async function scriptAttempts(videoId: string) {
    const [row] = await db
      .select({ n: count() })
      .from(generationJobs)
      .where(and(eq(generationJobs.videoId, videoId), eq(generationJobs.step, 'script')));
    return row?.n ?? 0;
  }

  /** Steps queued in the last day that match `where`, for the daily caps. */
  async function jobsToday(tx: Pick<Db, 'select'>, step: GenerationStep, where: SQL) {
    const [row] = await tx
      .select({ n: count() })
      .from(generationJobs)
      .innerJoin(videos, eq(videos.id, generationJobs.videoId))
      .where(and(eq(generationJobs.step, step), gt(generationJobs.createdAt, oneDayAgo), where));
    return row?.n ?? 0;
  }
  /** Scripts written for this user in the last day; each one is a paid Claude call. */
  const scriptsToday = (userId: string) => jobsToday(db, 'script', eq(videos.creatorId, userId));
  /** Free videos started by anyone in the last day. */
  const freeVideosToday = (tx: Pick<Db, 'select'>) =>
    jobsToday(tx, 'video', eq(videos.watermarked, true));

  async function detail(video: Video): Promise<VideoDetail> {
    const cast = await db
      .select({ memberId: members.id, displayName: members.displayName })
      .from(videoCast)
      .innerJoin(members, eq(members.id, videoCast.memberId))
      .where(eq(videoCast.videoId, video.id));
    return {
      id: video.id,
      groupId: video.groupId,
      status: video.status,
      style: video.style,
      title: video.script?.title ?? null,
      createdAt: video.createdAt.toISOString(),
      script: video.script,
      cast,
      watermarked: video.watermarked,
      playUrl: video.status === 'ready' && video.r2Key ? await storage.readUrl(video.r2Key) : null,
      canRegenerate:
        video.status === 'script_ready' &&
        video.inputText !== null &&
        (await scriptAttempts(video.id)) < MAX_SCRIPT_ATTEMPTS,
    };
  }

  /**
   * Creates a draft video and queues its script. The cast must be members of the group with a face
   * they consented to.
   */
  app.post('/', async (c) => {
    const parsed = createVideoSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
    const { groupId, inputText, style, castMemberIds } = parsed.data;

    const user = await currentUser(db, c.get('clerkUserId'));
    // Guideline 5.1.2(i): nothing goes to an AI provider before the user agreed to it.
    if (user.aiConsentVersion !== AI_CONSENT_VERSION) {
      return c.json({ error: 'ai_consent_required' }, 403);
    }
    if ((await scriptsToday(user.id)) >= MAX_SCRIPTS_PER_DAY) {
      return c.json({ error: 'daily_limit' }, 429);
    }

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

  // The raw chat text never leaves the server once it's been sent.
  app.get('/:id', async (c) => {
    const { video } = await ownVideo(c.get('clerkUserId'), c.req.param('id'));
    if (!video) return c.json({ error: 'not_found' }, 404);
    return c.json(await detail(video));
  });

  /** Saves the user's tweaks to the lines and subtitles before they approve. */
  app.put('/:id/script', async (c) => {
    const parsed = updateScriptSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
    const { video } = await ownVideo(c.get('clerkUserId'), c.req.param('id'));
    if (!video) return c.json({ error: 'not_found' }, 404);
    if (video.status !== 'script_ready' || !video.script)
      return c.json({ error: 'not_editable' }, 409);
    const edited = parsed.data.script;
    if (!sameShape(video.script, edited)) return c.json({ error: 'shape_changed' }, 400);
    // Only the spoken lines and subtitles change. The scene, cast directions and actions stay as
    // the writer wrote them, so an edit can't slip new instructions into the video prompt.
    const script: Script = {
      ...video.script,
      beats: video.script.beats.map((b, i) => ({
        ...b,
        line: edited.beats[i]!.line,
        subtitle: edited.beats[i]!.subtitle,
      })),
    };
    const [updated] = await db
      .update(videos)
      .set({ script })
      .where(eq(videos.id, video.id))
      .returning();
    return c.json(await detail(updated!));
  });

  /** Throws the script away and writes a new one from the same chat text. */
  app.post('/:id/regenerate', async (c) => {
    const { video } = await ownVideo(c.get('clerkUserId'), c.req.param('id'));
    if (!video) return c.json({ error: 'not_found' }, 404);
    if (video.status !== 'script_ready' || !video.inputText) {
      return c.json({ error: 'not_regenerable' }, 409);
    }
    if ((await scriptAttempts(video.id)) >= MAX_SCRIPT_ATTEMPTS) {
      return c.json({ error: 'too_many_attempts' }, 429);
    }
    if ((await scriptsToday(video.creatorId)) >= MAX_SCRIPTS_PER_DAY) {
      return c.json({ error: 'daily_limit' }, 429);
    }
    await db.transaction(async (tx) => {
      await tx.update(videos).set({ status: 'draft', script: null }).where(eq(videos.id, video.id));
      await tx.insert(generationJobs).values({ videoId: video.id, step: 'script' });
    });
    return c.json({ ok: true });
  });

  /**
   * Approves the script and starts the video. It's paid with the user's one free (watermarked)
   * video, or a credit; without either the app has to sell one first. The chat text is deleted here.
   * Once the day's free videos for everyone are gone, the user's free one waits for another day.
   */
  app.post('/:id/approve', async (c) => {
    const { user, video } = await ownVideo(c.get('clerkUserId'), c.req.param('id'));
    if (!video) return c.json({ error: 'not_found' }, 404);
    const result = await db.transaction(async (tx): Promise<ApproveResult | null> => {
      const [locked] = await tx.select().from(videos).where(eq(videos.id, video.id)).for('update');
      if (locked?.status !== 'script_ready') return null;
      const [payer] = await tx.select().from(users).where(eq(users.id, user.id)).for('update');
      let paidWith: 'free' | 'credit';
      if (!payer!.freeVideoUsed) {
        if ((await freeVideosToday(tx)) >= freeVideosPerDay) return { error: 'free_limit' };
        paidWith = 'free';
        await tx.update(users).set({ freeVideoUsed: true }).where(eq(users.id, user.id));
      } else if (payer!.videoCredits > 0) {
        paidWith = 'credit';
        await tx
          .update(users)
          .set({ videoCredits: payer!.videoCredits - 1 })
          .where(eq(users.id, user.id));
      } else {
        return { error: 'payment_required' };
      }
      await tx
        .update(videos)
        .set({ status: 'paid', inputText: null, watermarked: paidWith === 'free' })
        .where(eq(videos.id, video.id));
      await tx.insert(generationJobs).values({ videoId: video.id, step: 'video' });
      return { status: 'paid', paidWith };
    });
    if (!result) return c.json({ error: 'not_approvable' }, 409);
    if (!('error' in result)) return c.json(result, 200);
    return c.json(result, result.error === 'free_limit' ? 429 : 402);
  });

  /** Deletes the video for good, including the file. */
  app.delete('/:id', async (c) => {
    const { video } = await ownVideo(c.get('clerkUserId'), c.req.param('id'));
    if (!video) return c.json({ error: 'not_found' }, 404);
    await db
      .update(videos)
      .set({ status: 'deleted', inputText: null, r2Key: null })
      .where(eq(videos.id, video.id));
    if (video.r2Key) await storage.remove(video.r2Key);
    return c.json({ ok: true });
  });

  return app;
}
