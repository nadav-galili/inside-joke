import {
  AI_CONSENT_VERSION,
  AI_PROVIDERS,
  FACE_CONSENT_TEXT,
  FACE_CONSENT_VERSION,
  joinGroupSchema,
  MAX_DISPLAY_NAME,
} from '@insidejoke/shared';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import { page } from './html.ts';
import { faces, groups, members, reports, videoCast, videos, type Db } from '@insidejoke/db';
import { joinSelfiePrefix, newSelfieKey, type Storage } from './storage.ts';

const newManageToken = () =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url');

/**
 * The invite link a group creator shares in their real chat. A friend joins from it with their own
 * selfie and consent, without installing the app; this is the only way a friend's face gets in.
 */
export function joinRoutes(db: Db, storage: Storage, publicUrl: string) {
  const app = new Hono();

  async function groupByCode(code: string) {
    const [group] = await db.select().from(groups).where(eq(groups.inviteCode, code));
    return group;
  }

  app.get('/join/:code', async (c) => {
    const group = await groupByCode(c.req.param('code'));
    if (!group)
      return c.html(page('Invite not found', html`<h1>This invite link isn't valid.</h1>`), 404);
    const providers = AI_PROVIDERS.map((p) => html`<li><b>${p.name}</b> gets ${p.receives}.</li>`);
    return c.html(
      page(
        `Join ${group.name}`,
        html`<p class="eyebrow">Casting call</p>
          <h1>Star in ${group.name}'s videos</h1>
          <p class="muted">
            Your friends make short, funny AI videos from moments in your group chat. Add your own
            selfie to be in them. Only you can add your face.
          </p>
          <form id="f">
            <label for="name">Your name in the group</label>
            <input
              id="name"
              type="text"
              maxlength="${MAX_DISPLAY_NAME}"
              required
              autocomplete="given-name"
            />
            <label for="photo">Your selfie</label>
            <label class="shot" for="photo">
              <span id="hint">Tap to take<br />your selfie</span>
              <img id="preview" class="preview" hidden alt="Your selfie" />
            </label>
            <input
              id="photo"
              class="visually-hidden"
              type="file"
              accept="image/*"
              capture="user"
              required
            />
            <label class="check"
              ><input id="face" type="checkbox" required /> <span>${FACE_CONSENT_TEXT}</span></label
            >
            <label class="check"
              ><input id="ai" type="checkbox" required />
              <span
                >I agree that my data is sent to these AI services:
                <ul>
                  ${providers}
                </ul></span
              ></label
            >
            <label class="check"
              ><input id="adult" type="checkbox" required /> <span>I'm 18 or older.</span></label
            >
            <button id="go" type="submit">Join the cast</button>
            <p id="err" class="error"></p>
          </form>
          <div id="done" hidden>
            <p class="eyebrow">You're in the cast</p>
            <h1>See you on screen</h1>
            <p class="muted">You can now star in ${group.name}'s videos.</p>
            <p class="card">
              Keep this link. It lets you remove your face, or any video you're in, at any time:<br /><a
                id="manage"
                href="#"
              ></a>
            </p>
          </div>
          <script>
            ${raw(joinScript(c.req.param('code')))};
          </script>`,
      ),
    );
  });

  app.post('/join/:code/upload-url', async (c) => {
    const group = await groupByCode(c.req.param('code'));
    if (!group) return c.json({ error: 'not_found' }, 404);
    const key = newSelfieKey(joinSelfiePrefix(group.id));
    return c.json({ key, uploadUrl: await storage.uploadUrl(key) });
  });

  app.post('/join/:code', async (c) => {
    const group = await groupByCode(c.req.param('code'));
    if (!group) return c.json({ error: 'not_found' }, 404);
    const parsed = joinGroupSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const { displayName, key, consentTextVersion, aiConsentVersion } = parsed.data;
    if (!key.startsWith(joinSelfiePrefix(group.id))) return c.json({ error: 'invalid_key' }, 400);
    if (!(await storage.exists(key))) return c.json({ error: 'not_uploaded' }, 400);
    const manageToken = newManageToken();
    await db.transaction(async (tx) => {
      const [member] = await tx
        .insert(members)
        .values({
          groupId: group.id,
          displayName,
          inviteStatus: 'joined',
          aiConsentVersion,
          manageToken,
        })
        .returning();
      await tx.insert(faces).values({ memberId: member!.id, r2Key: key, consentTextVersion });
    });
    return c.json({ manageUrl: `${publicUrl}/m/${manageToken}` }, 201);
  });

  async function memberByToken(token: string) {
    const [row] = await db
      .select({ member: members, groupName: groups.name })
      .from(members)
      .innerJoin(groups, eq(groups.id, members.groupId))
      .where(eq(members.manageToken, token));
    return row;
  }

  /** Videos this member is in that still exist, newest first. */
  async function videosOf(memberId: string) {
    return db
      .select({
        id: videos.id,
        script: videos.script,
        r2Key: videos.r2Key,
        createdAt: videos.createdAt,
      })
      .from(videoCast)
      .innerJoin(videos, eq(videos.id, videoCast.videoId))
      .where(
        and(
          eq(videoCast.memberId, memberId),
          inArray(videos.status, ['script_ready', 'paid', 'generating', 'ready']),
        ),
      )
      .orderBy(desc(videos.createdAt));
  }

  app.get('/m/:token', async (c) => {
    const token = c.req.param('token');
    const row = await memberByToken(token);
    if (!row) return c.html(page('Not found', html`<h1>This link isn't valid.</h1>`), 404);
    const [face] = await db
      .select()
      .from(faces)
      .where(and(eq(faces.memberId, row.member.id), isNull(faces.revokedAt)));
    const list = await videosOf(row.member.id);
    const videoList = list.map(
      (v) =>
        html`<li>
          ${v.script?.title ?? 'Untitled video'}, ${v.createdAt.toISOString().slice(0, 10)}
          <form method="post" action="/m/${token}/videos/${v.id}/remove">
            <button type="submit" class="secondary">Remove this video</button>
          </form>
        </li>`,
    );
    return c.html(
      page(
        'Your face in Inside Joke',
        html`${
          face
            ? html`<p class="eyebrow">Your face</p>
                <h1>${row.member.displayName} in ${row.groupName}</h1>
                <p class="muted">Your selfie can be used in this group's new videos.</p>
                <form method="post" action="/m/${token}/remove">
                  <button type="submit" class="secondary">Remove my face</button>
                </form>`
            : html`<p class="eyebrow">Your face</p>
                <h1>Your face is removed</h1>
                <p class="muted">Nobody in ${row.groupName} can use it in a new video.</p>`
        }
        ${
          list.length > 0
            ? html`<h2>Videos you're in</h2>
                <p class="muted">Removing a video deletes it for everyone, at once.</p>
                <ul class="videos">
                  ${videoList}
                </ul>`
            : ''
        }`,
      ),
    );
  });

  /** A cast member takes a video they're in down. It is deleted at once and the request logged. */
  app.post('/m/:token/videos/:videoId/remove', async (c) => {
    const token = c.req.param('token');
    const row = await memberByToken(token);
    if (!row) return c.json({ error: 'not_found' }, 404);
    const mine = await videosOf(row.member.id);
    const video = mine.find((v) => v.id === c.req.param('videoId'));
    if (!video) return c.redirect(`/m/${token}`, 303);
    await db.transaction(async (tx) => {
      await tx
        .insert(reports)
        .values({ videoId: video.id, memberId: row.member.id, reason: 'cast_member_removal' });
      await tx
        .update(videos)
        .set({ status: 'deleted', inputText: null, r2Key: null })
        .where(eq(videos.id, video.id));
    });
    if (video.r2Key) await storage.remove(video.r2Key);
    return c.redirect(`/m/${token}`, 303);
  });

  /** Withdraws consent: the selfie is deleted and the member can't be cast again. */
  app.post('/m/:token/remove', async (c) => {
    const row = await memberByToken(c.req.param('token'));
    if (!row) return c.json({ error: 'not_found' }, 404);
    const active = await db
      .update(faces)
      .set({ revokedAt: new Date() })
      .where(and(eq(faces.memberId, row.member.id), isNull(faces.revokedAt)))
      .returning();
    await db.update(members).set({ inviteStatus: 'left' }).where(eq(members.id, row.member.id));
    await Promise.all(active.map((f) => storage.remove(f.r2Key)));
    return c.redirect(`/m/${c.req.param('token')}`, 303);
  });

  return app;
}

/** Shrinks the selfie to a JPEG in the browser (which also drops its location data) and joins. */
function joinScript(code: string) {
  return `
const code = ${JSON.stringify(code)};
const $ = (id) => document.getElementById(id);
$('photo').addEventListener('change', () => {
  const file = $('photo').files[0];
  if (file) { $('preview').src = URL.createObjectURL(file); $('preview').hidden = false; $('hint').hidden = true; }
});
async function toJpeg(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}
$('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('go').disabled = true;
  $('err').textContent = '';
  try {
    const jpeg = await toJpeg($('photo').files[0]);
    const target = await (await fetch('/join/' + code + '/upload-url', { method: 'POST' })).json();
    const put = await fetch(target.uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: jpeg });
    if (!put.ok) throw new Error('upload');
    const res = await fetch('/join/' + code, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName: $('name').value,
        key: target.key,
        consentTextVersion: ${JSON.stringify(FACE_CONSENT_VERSION)},
        aiConsentVersion: ${JSON.stringify(AI_CONSENT_VERSION)},
        adult: true,
      }),
    });
    if (!res.ok) throw new Error('join');
    const { manageUrl } = await res.json();
    $('manage').href = manageUrl;
    $('manage').textContent = manageUrl;
    $('f').hidden = true;
    $('done').hidden = false;
  } catch {
    $('err').textContent = "Something went wrong. Please try again.";
    $('go').disabled = false;
  }
});`;
}
