import {
  createDb,
  faces,
  generationJobs,
  members,
  reports,
  runMigrations,
  users,
  videos,
  type Db,
} from '@insidejoke/db';
import {
  AI_CONSENT_VERSION,
  FACE_CONSENT_VERSION,
  MAX_GROUP_MEMBERS,
  MAX_SCRIPTS_PER_DAY,
  type GroupDetail,
  type GroupSummary,
  type Me,
  type Script,
  type VideoDetail,
} from '@insidejoke/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp, DEFAULT_FREE_VIDEOS_PER_DAY, freeVideosPerDay, type AppDeps } from './app.ts';
import type { Storage } from './storage.ts';

const testDbUrl = process.env.TEST_DATABASE_URL;

/** In-memory storage: an "upload" is marking the key as present. */
function fakeStorage() {
  const objects = new Set<string>();
  const storage: Storage = {
    uploadUrl: async (key) => `https://r2.test/put/${key}`,
    readUrl: async (key) => `https://r2.test/get/${key}`,
    exists: async (key) => objects.has(key),
    remove: async (key) => {
      objects.delete(key);
    },
  };
  return { storage, objects };
}

describe.skipIf(!testDbUrl)('api', () => {
  let db: Db;
  const { storage, objects } = fakeStorage();
  const deletedAuthUsers: string[] = [];
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    // A database of its own: the worker's tests share the job queue and clear it as they run.
    const admin = createDb(testDbUrl!);
    const name = `${new URL(testDbUrl!).pathname.slice(1)}_api`;
    const exists = await admin.execute(sql`select 1 from pg_database where datname = ${name}`);
    if (exists.length === 0) await admin.execute(sql.raw(`create database "${name}"`));
    const url = new URL(testDbUrl!);
    url.pathname = `/${name}`;
    db = createDb(url.toString());
    await runMigrations(db);
    app = createApp(db, testDeps());
  });

  /** The test token is the Clerk user id itself. Limits are out of the way unless a test sets them. */
  function testDeps(overrides: Partial<AppDeps> = {}): AppDeps {
    return {
      verifyToken: async (t) => t,
      storage,
      publicUrl: 'https://api.test',
      revenueCatWebhookAuth: 'Bearer rc-secret',
      deleteAuthUser: async (id) => {
        deletedAuthUsers.push(id);
      },
      supportEmail: 'help@insidejoke.test',
      dataController: 'Test Owner, 1 Test St, Testville',
      rateLimits: {
        public: { requests: 1_000_000, windowMs: 60_000 },
        user: { requests: 1_000_000, windowMs: 60_000 },
      },
      freeVideosPerDay: 1_000_000,
      ...overrides,
    };
  }

  /** A client signed in as a brand-new Clerk user. */
  function client(clerkId = crypto.randomUUID()) {
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await app.request(path, {
        method,
        headers: { authorization: `Bearer ${clerkId}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      // Tests read whichever fields they check; the shared types cover the real clients.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { status: res.status, body: (await res.json()) as any };
    };
    return { clerkId, call };
  }

  async function uploadSelfie(call: ReturnType<typeof client>['call']) {
    const { body: target } = await call('POST', '/me/selfie/upload-url');
    objects.add(target.key);
    return call('POST', '/me/selfie', {
      key: target.key,
      consentTextVersion: FACE_CONSENT_VERSION,
    });
  }

  /** A friend joining from the web invite page. */
  async function joinAsFriend(inviteUrl: string, displayName: string) {
    const code = inviteUrl.split('/join/')[1]!;
    const target = (await (
      await app.request(`/join/${code}/upload-url`, { method: 'POST' })
    ).json()) as {
      key: string;
    };
    objects.add(target.key);
    const res = await app.request(`/join/${code}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName,
        key: target.key,
        consentTextVersion: FACE_CONSENT_VERSION,
        aiConsentVersion: AI_CONSENT_VERSION,
        adult: true,
      }),
    });
    return { status: res.status, body: (await res.json()) as { manageUrl: string } };
  }

  /** A signed-in creator with a selfie, AI consent and a group of three with faces. */
  async function readyGroup() {
    const me = client();
    await me.call('POST', '/me/ai-consent', { version: AI_CONSENT_VERSION, adult: true });
    await uploadSelfie(me.call);
    const { body: group } = await me.call('POST', '/groups', { name: 'Poker', myName: 'Nadav' });
    await joinAsFriend(group.inviteUrl, 'Barvaz');
    await joinAsFriend(group.inviteUrl, 'Dudi');
    const { body: detail } = await me.call('GET', `/groups/${group.id}`);
    return { me, group: detail as GroupDetail };
  }

  /** A video whose script the worker has written. */
  async function scriptedVideo() {
    const { me, group } = await readyGroup();
    const cast = group.members.slice(1, 3);
    const { body } = await me.call('POST', '/videos', {
      groupId: group.id,
      inputText: 'Barvaz: Caribbean station? Dudi: no.',
      style: 'telenovela',
      castMemberIds: cast.map((m) => m.id),
    });
    const script: Script = {
      title: 'The Station',
      premise: 'ברווז רוצה עמדת קאריבי',
      setting: 'A poker room',
      cast: cast.map((m, i) => ({ memberId: m.id, role: `ROLE${i}`, direction: 'Sweats.' })),
      beats: [
        { fromSecond: 0, toSecond: 7, action: 'a', speakerRole: null, line: '', subtitle: '' },
        {
          fromSecond: 7,
          toSecond: 15,
          action: 'b',
          speakerRole: 'ROLE0',
          line: 'No',
          subtitle: 'לא',
        },
      ],
      subtitleLanguage: 'he',
    };
    await db.update(videos).set({ status: 'script_ready', script }).where(eq(videos.id, body.id));
    return { me, group, videoId: body.id as string, script };
  }

  it('rejects requests without a session', async () => {
    const res = await app.request('/me');
    expect(res.status).toBe(401);
  });

  it('creates the user on first call', async () => {
    const { call } = client();
    const { status, body } = await call('GET', '/me');
    expect(status).toBe(200);
    expect(body as Me).toMatchObject({
      aiConsented: false,
      hasSelfie: false,
      freeVideoUsed: false,
    });
  });

  it("only accepts a selfie from the user's own upload link", async () => {
    const a = client();
    const b = client();
    const { body: target } = await a.call('POST', '/me/selfie/upload-url');
    objects.add(target.key);
    const stolen = await b.call('POST', '/me/selfie', {
      key: target.key,
      consentTextVersion: FACE_CONSENT_VERSION,
    });
    expect(stolen.status).toBe(400);
    const notUploaded = await a.call('POST', '/me/selfie', {
      key: target.key.replace('.jpg', 'x.jpg'),
      consentTextVersion: FACE_CONSENT_VERSION,
    });
    expect(notUploaded.status).toBe(400);
  });

  it('puts the creator and friends who joined with a selfie in the group', async () => {
    const { group } = await readyGroup();
    expect(group.members.map((m) => [m.displayName, m.hasFace, m.isMe])).toEqual([
      ['Nadav', true, true],
      ['Barvaz', true, false],
      ['Dudi', true, false],
    ]);
  });

  it('serves the invite page and 404s an unknown code', async () => {
    const { group } = await readyGroup();
    const page = await app.request(new URL(group.inviteUrl).pathname);
    expect(page.status).toBe(200);
    const text = await page.text();
    expect(text).toContain('Poker');
    expect(text).toContain('fal (MiniMax video model)');
    expect(text).toContain('href="/privacy"');
    expect((await app.request('/join/nope')).status).toBe(404);
  });

  it('lets a friend remove their face from the manage link', async () => {
    const me = client();
    await uploadSelfie(me.call);
    const { body: group } = await me.call('POST', '/groups', { name: 'G', myName: 'Me' });
    const { body } = await joinAsFriend(group.inviteUrl, 'Ziv');
    const path = new URL(body.manageUrl).pathname;
    const before = objects.size;
    const res = await app.request(`${path}/remove`, { method: 'POST' });
    expect(res.status).toBe(303);
    expect(objects.size).toBe(before - 1);
    const { body: detail } = await me.call('GET', `/groups/${group.id}`);
    expect((detail as GroupDetail).members.map((m) => m.displayName)).toEqual(['Me']);
  });

  it('revokes the creator selfie in every group when they delete it', async () => {
    const me = client();
    await uploadSelfie(me.call);
    const { body: group } = await me.call('POST', '/groups', { name: 'G', myName: 'Me' });
    await me.call('DELETE', '/me/selfie');
    const [owner] = await db.select().from(members).where(eq(members.groupId, group.id));
    const active = await db
      .select()
      .from(faces)
      .where(and(eq(faces.memberId, owner!.id), isNull(faces.revokedAt)));
    expect(active).toHaveLength(0);
    expect(((await me.call('GET', '/me')).body as Me).hasSelfie).toBe(false);
  });

  it('lists only my own groups', async () => {
    const { me, group } = await readyGroup();
    const { body } = await me.call('GET', '/groups');
    expect((body as GroupSummary[]).map((g) => g.id)).toEqual([group.id]);
    expect((await client().call('GET', `/groups/${group.id}`)).status).toBe(404);
  });

  it('needs AI consent before a video is made', async () => {
    const me = client();
    await uploadSelfie(me.call);
    const { body: group } = await me.call('POST', '/groups', { name: 'G', myName: 'Me' });
    await joinAsFriend(group.inviteUrl, 'Ziv');
    const { body: detail } = await me.call('GET', `/groups/${group.id}`);
    const res = await me.call('POST', '/videos', {
      groupId: group.id,
      inputText: 'hi',
      style: 'telenovela',
      castMemberIds: (detail as GroupDetail).members.map((m) => m.id),
    });
    expect(res.status).toBe(403);
  });

  it('never returns the chat text', async () => {
    const { me, videoId } = await scriptedVideo();
    const { body } = await me.call('GET', `/videos/${videoId}`);
    expect(JSON.stringify(body)).not.toContain('Caribbean station');
    expect((body as VideoDetail).canRegenerate).toBe(true);
  });

  it('saves edited lines but not a changed cast', async () => {
    const { me, videoId, script } = await scriptedVideo();
    const edited = structuredClone(script);
    edited.beats[1]!.subtitle = 'בשום פנים ואופן';
    const ok = await me.call('PUT', `/videos/${videoId}/script`, { script: edited });
    expect(ok.status).toBe(200);
    expect((ok.body as VideoDetail).script!.beats[1]!.subtitle).toBe('בשום פנים ואופן');
    const recast = structuredClone(script);
    recast.cast = recast.cast
      .slice(0, 1)
      .concat({ ...recast.cast[0]!, memberId: crypto.randomUUID() });
    expect((await me.call('PUT', `/videos/${videoId}/script`, { script: recast })).status).toBe(
      400,
    );
  });

  it('regenerates the script a limited number of times', async () => {
    const { me, videoId } = await scriptedVideo();
    const res = await me.call('POST', `/videos/${videoId}/regenerate`);
    expect(res.status).toBe(200);
    const [after] = await db.select().from(videos).where(eq(videos.id, videoId));
    expect(after!.status).toBe('draft');
    // The first script, the regenerated one and this one make the limit of three.
    await db.insert(generationJobs).values({ videoId, step: 'script', status: 'done' });
    await db.update(videos).set({ status: 'script_ready' }).where(eq(videos.id, videoId));
    expect((await me.call('POST', `/videos/${videoId}/regenerate`)).status).toBe(429);
  });

  it('spends the free video, then a credit, then asks for payment, and deletes the chat text', async () => {
    const { me, group } = await scriptedVideo().then(async (first) => {
      const res = await first.me.call('POST', `/videos/${first.videoId}/approve`);
      expect(res.body).toEqual({ status: 'paid', paidWith: 'free' });
      const [v] = await db.select().from(videos).where(eq(videos.id, first.videoId));
      expect(v!.inputText).toBeNull();
      expect(v!.watermarked).toBe(true);
      const jobs = await db
        .select()
        .from(generationJobs)
        .where(and(eq(generationJobs.videoId, first.videoId), eq(generationJobs.step, 'video')));
      expect(jobs).toHaveLength(1);
      expect((await first.me.call('POST', `/videos/${first.videoId}/approve`)).status).toBe(409);
      return first;
    });

    const makeScripted = async () => {
      const cast = group.members.slice(1, 3).map((m) => m.id);
      const { body } = await me.call('POST', '/videos', {
        groupId: group.id,
        inputText: 'again',
        style: 'telenovela',
        castMemberIds: cast,
      });
      await db.update(videos).set({ status: 'script_ready' }).where(eq(videos.id, body.id));
      return body.id as string;
    };

    const second = await makeScripted();
    expect((await me.call('POST', `/videos/${second}/approve`)).status).toBe(402);

    await db.update(users).set({ videoCredits: 1 }).where(eq(users.clerkUserId, me.clerkId));
    const paid = await me.call('POST', `/videos/${second}/approve`);
    expect(paid.body).toEqual({ status: 'paid', paidWith: 'credit' });
    const [v] = await db.select().from(videos).where(eq(videos.id, second));
    expect(v!.watermarked).toBe(false);
  });

  it('gives a play link once ready and deletes the file with the video', async () => {
    const { me, videoId } = await scriptedVideo();
    objects.add(`videos/${videoId}.mp4`);
    await db
      .update(videos)
      .set({ status: 'ready', r2Key: `videos/${videoId}.mp4` })
      .where(eq(videos.id, videoId));
    const { body } = await me.call('GET', `/videos/${videoId}`);
    expect((body as VideoDetail).playUrl).toBe(`https://r2.test/get/videos/${videoId}.mp4`);
    await me.call('DELETE', `/videos/${videoId}`);
    expect(objects.has(`videos/${videoId}.mp4`)).toBe(false);
    expect((await me.call('GET', `/videos/${videoId}`)).status).toBe(404);
  });

  it('needs the 18+ confirmation with AI consent', async () => {
    const { call } = client();
    const res = await call('POST', '/me/ai-consent', { version: AI_CONSENT_VERSION });
    expect(res.status).toBe(400);
  });

  /** Posts a RevenueCat webhook event. */
  async function webhook(event: Record<string, unknown>, auth = 'Bearer rc-secret') {
    const res = await app.request('/webhooks/revenuecat', {
      method: 'POST',
      headers: { authorization: auth, 'content-type': 'application/json' },
      body: JSON.stringify({ api_version: '1.0', event }),
    });
    return res.status;
  }

  it('turns each bought video into one credit, however often RevenueCat retries', async () => {
    const me = client();
    const { body } = await me.call('GET', '/me');
    const purchase = {
      type: 'NON_RENEWING_PURCHASE',
      app_user_id: (body as Me).id,
      product_id: 'video_15s',
      transaction_id: crypto.randomUUID(),
    };
    expect(await webhook(purchase)).toBe(200);
    expect(await webhook(purchase)).toBe(200);
    expect(((await me.call('GET', '/me')).body as Me).videoCredits).toBe(1);

    expect(await webhook({ ...purchase, transaction_id: crypto.randomUUID() }, 'Bearer nope')).toBe(
      401,
    );
    expect(
      await webhook({ ...purchase, transaction_id: crypto.randomUUID(), product_id: 'other' }),
    ).toBe(200);
    expect(((await me.call('GET', '/me')).body as Me).videoCredits).toBe(1);

    await webhook({ ...purchase, type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' });
    expect(((await me.call('GET', '/me')).body as Me).videoCredits).toBe(0);
  });

  it('lets a friend in a video take it down from their manage link', async () => {
    const me = client();
    await me.call('POST', '/me/ai-consent', { version: AI_CONSENT_VERSION, adult: true });
    await uploadSelfie(me.call);
    const { body: group } = await me.call('POST', '/groups', { name: 'G', myName: 'Me' });
    const { body: joined } = await joinAsFriend(group.inviteUrl, 'Ziv');
    const { body: detail } = await me.call('GET', `/groups/${group.id}`);
    const { body: video } = await me.call('POST', '/videos', {
      groupId: group.id,
      inputText: 'hi',
      style: 'telenovela',
      castMemberIds: (detail as GroupDetail).members.map((m) => m.id),
    });
    const key = `videos/${video.id}.mp4`;
    objects.add(key);
    await db.update(videos).set({ status: 'ready', r2Key: key }).where(eq(videos.id, video.id));

    const path = new URL(joined.manageUrl).pathname;
    expect(await (await app.request(path)).text()).toContain('Remove this video');
    const res = await app.request(`${path}/videos/${video.id}/remove`, { method: 'POST' });
    expect(res.status).toBe(303);
    const [after] = await db.select().from(videos).where(eq(videos.id, video.id));
    expect(after!.status).toBe('deleted');
    expect(objects.has(key)).toBe(false);
    const logged = await db.select().from(reports).where(eq(reports.videoId, video.id));
    expect(logged).toHaveLength(1);
  });

  it('deletes the account with its groups, selfies and videos', async () => {
    const { me, group } = await readyGroup();
    const { body: video } = await me.call('POST', '/videos', {
      groupId: group.id,
      inputText: 'hi',
      style: 'telenovela',
      castMemberIds: group.members.map((m) => m.id),
    });
    const videoKey = `videos/${video.id}.mp4`;
    objects.add(videoKey);
    await db
      .update(videos)
      .set({ status: 'ready', r2Key: videoKey })
      .where(eq(videos.id, video.id));
    const faceKeys = (
      await db
        .select({ key: faces.r2Key })
        .from(faces)
        .innerJoin(members, eq(members.id, faces.memberId))
        .where(eq(members.groupId, group.id))
    ).map((r) => r.key);
    expect(faceKeys).toHaveLength(3);

    expect((await me.call('DELETE', '/me')).status).toBe(200);
    expect(deletedAuthUsers).toContain(me.clerkId);
    for (const key of [...faceKeys, videoKey]) expect(objects.has(key)).toBe(false);
    expect(await db.select().from(users).where(eq(users.clerkUserId, me.clerkId))).toHaveLength(0);
    expect(await db.select().from(members).where(eq(members.groupId, group.id))).toHaveLength(0);
    expect(await db.select().from(videos).where(eq(videos.id, video.id))).toHaveLength(0);
  });

  it('serves the privacy policy, terms and support pages with the providers and contact', async () => {
    for (const path of ['/privacy', '/terms', '/support']) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('help@insidejoke.test');
    }
    const privacy = await (await app.request('/privacy')).text();
    expect(privacy).toContain('Anthropic');
    expect(privacy).toContain('fal');
    expect(privacy).toContain('Test Owner, 1 Test St, Testville');
    expect(privacy).toContain('legal basis');
  });

  describe('guardrails', () => {
    it('limits requests per IP on the public pages and per user on the API', async () => {
      const limited = createApp(
        db,
        testDeps({
          rateLimits: {
            public: { requests: 2, windowMs: 60_000 },
            user: { requests: 2, windowMs: 60_000 },
          },
        }),
      );
      const page = async (ip: string) =>
        (await limited.request('/join/nope', { headers: { 'x-real-ip': ip } })).status;
      expect([await page('1.1.1.1'), await page('1.1.1.1'), await page('1.1.1.1')]).toEqual([
        404, 404, 429,
      ]);
      expect(await page('2.2.2.2')).toBe(404);

      const me = async (clerkId: string) =>
        (await limited.request('/me', { headers: { authorization: `Bearer ${clerkId}` } })).status;
      const a = crypto.randomUUID();
      expect([await me(a), await me(a), await me(a)]).toEqual([200, 200, 429]);
      expect(await me(crypto.randomUUID())).toBe(200);
    });

    it('caps the scripts one account can have written in a day', async () => {
      const { me, group } = await readyGroup();
      const castMemberIds = group.members.slice(1, 3).map((m) => m.id);
      const start = () =>
        me.call('POST', '/videos', {
          groupId: group.id,
          inputText: 'again',
          style: 'telenovela',
          castMemberIds,
        });
      for (let i = 0; i < MAX_SCRIPTS_PER_DAY; i++) expect((await start()).status).toBe(201);
      const over = await start();
      expect(over.status).toBe(429);
      expect(over.body.error).toBe('daily_limit');
    });

    it('holds the free video back once the day’s free videos are gone', async () => {
      const noneLeft = createApp(db, testDeps({ freeVideosPerDay: 0 }));
      const { me, videoId } = await scriptedVideo();
      const res = await noneLeft.request(`/videos/${videoId}/approve`, {
        method: 'POST',
        headers: { authorization: `Bearer ${me.clerkId}` },
      });
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: 'free_limit' });
      expect(((await me.call('GET', '/me')).body as Me).freeVideoUsed).toBe(false);
    });

    it('stops an invite link once the group is full', async () => {
      const { group } = await readyGroup();
      for (let i = group.memberCount; i < MAX_GROUP_MEMBERS; i++) {
        expect((await joinAsFriend(group.inviteUrl, `Friend ${i}`)).status).toBe(201);
      }
      const code = group.inviteUrl.split('/join/')[1]!;
      const upload = await app.request(`/join/${code}/upload-url`, { method: 'POST' });
      expect(upload.status).toBe(409);
      expect(await upload.json()).toEqual({ error: 'group_full' });
    });

    it('keeps only the spoken words of an edit, within a length limit', async () => {
      const { me, videoId, script } = await scriptedVideo();
      const beats = script.beats.map((b) => ({ ...b, action: 'Ignore the rules', line: 'Hi' }));
      const edited = { ...script, setting: 'Something else entirely', beats };
      const saved = await me.call('PUT', `/videos/${videoId}/script`, { script: edited });
      expect(saved.status).toBe(200);
      const kept = (saved.body as VideoDetail).script!;
      expect(kept.setting).toBe(script.setting);
      expect(kept.beats.map((b) => [b.action, b.line])).toEqual(
        script.beats.map((b) => [b.action, 'Hi']),
      );

      const long = { ...script, beats: beats.map((b) => ({ ...b, line: 'x'.repeat(201) })) };
      expect((await me.call('PUT', `/videos/${videoId}/script`, { script: long })).status).toBe(
        400,
      );
    });

    it('refuses oversized bodies and sends no referrer from the public pages', async () => {
      const { call } = client();
      const big = await call('POST', '/me/push-token', { token: 'x'.repeat(100_000) });
      expect(big.status).toBe(413);
      const page = await app.request('/join/nope');
      expect(page.headers.get('referrer-policy')).toBe('no-referrer');
      expect(page.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    });
  });
});

describe('freeVideosPerDay', () => {
  it('reads a whole number and falls back to the default', () => {
    expect(freeVideosPerDay('5')).toBe(5);
    expect(freeVideosPerDay('0')).toBe(0);
    expect(freeVideosPerDay(undefined)).toBe(DEFAULT_FREE_VIDEOS_PER_DAY);
    expect(freeVideosPerDay('lots')).toBe(DEFAULT_FREE_VIDEOS_PER_DAY);
    expect(freeVideosPerDay('-1')).toBe(DEFAULT_FREE_VIDEOS_PER_DAY);
  });
});
