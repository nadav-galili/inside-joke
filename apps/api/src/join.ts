import {
  AI_CONSENT_VERSION,
  AI_PROVIDERS,
  FACE_CONSENT_TEXT,
  FACE_CONSENT_VERSION,
  joinGroupSchema,
  MAX_DISPLAY_NAME,
} from '@insidejoke/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import { faces, groups, members, type Db } from '@insidejoke/db';
import { joinSelfiePrefix, newSelfieKey, type Storage } from './storage.ts';

const newManageToken = () =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url');

const page = (title: string, body: ReturnType<typeof html>) =>
  html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>${title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Courier+Prime:wght@700&display=swap"
        />
        <style>
          /* The app's "Opening Night" look: velvet ground, house-light text, one amber bulb. */
          :root {
            color-scheme: dark;
            --velvet: #1a0e16;
            --card: #251520;
            --raised: #33202c;
            --line: #4a3140;
            --cream: #fff3e2;
            --dust: #bba2ab;
            --bulb: #ffb53d;
            --on-bulb: #2a1405;
            --display: 'Bricolage Grotesque', 'Avenir Next', system-ui, sans-serif;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font:
              17px/1.5 -apple-system,
              system-ui,
              sans-serif;
            background: var(--velvet);
            color: var(--cream);
            margin: 0 auto;
            max-width: 480px;
            padding: 32px 20px 56px;
          }
          .eyebrow {
            font:
              700 12px/1 'Courier Prime',
              ui-monospace,
              monospace;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: var(--bulb);
            margin: 0 0 12px;
          }
          h1 {
            font: 800 34px/1.02 var(--display);
            letter-spacing: -0.03em;
            margin: 0 0 12px;
            text-wrap: balance;
          }
          a {
            color: var(--bulb);
            word-break: break-all;
          }
          label {
            display: block;
            margin: 24px 0 8px;
            font:
              700 12px/1 'Courier Prime',
              ui-monospace,
              monospace;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: var(--dust);
          }
          input[type='text'] {
            width: 100%;
            padding: 15px 16px;
            font-size: 17px;
            color: var(--cream);
            background: var(--raised);
            border-radius: 16px;
            border: 1.5px solid transparent;
            outline: none;
          }
          input[type='text']:focus {
            border-color: var(--bulb);
          }
          .visually-hidden {
            position: absolute;
            width: 1px;
            height: 1px;
            opacity: 0;
            overflow: hidden;
          }
          .shot {
            width: 200px;
            height: 200px;
            margin: 8px auto 0;
            border-radius: 50%;
            border: 2px dashed var(--bulb);
            background: var(--card);
            display: grid;
            place-items: center;
            overflow: hidden;
            cursor: pointer;
            font:
              15px/1.3 -apple-system,
              system-ui,
              sans-serif;
            letter-spacing: 0;
            text-transform: none;
            color: var(--dust);
            text-align: center;
          }
          .shot:has(img:not([hidden])) {
            border: 4px solid var(--bulb);
          }
          .shot:focus-within {
            outline: 2px solid var(--cream);
            outline-offset: 4px;
          }
          img.preview {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .check {
            display: flex;
            gap: 12px;
            align-items: flex-start;
            background: var(--card);
            border-radius: 18px;
            padding: 16px;
            margin-top: 12px;
            font:
              15px/1.45 -apple-system,
              system-ui,
              sans-serif;
            letter-spacing: 0;
            text-transform: none;
            color: var(--cream);
          }
          .check input {
            accent-color: var(--bulb);
            width: 20px;
            height: 20px;
            margin: 1px 0 0;
            flex: none;
          }
          .check ul {
            margin: 8px 0 0;
            padding-left: 18px;
            color: var(--dust);
          }
          button {
            width: 100%;
            margin-top: 28px;
            padding: 17px;
            font: 800 17px var(--display);
            color: var(--on-bulb);
            background: var(--bulb);
            border: 0;
            border-radius: 18px;
            box-shadow: 0 10px 30px -10px var(--bulb);
            cursor: pointer;
          }
          button:active {
            transform: scale(0.98);
          }
          button:disabled {
            opacity: 0.5;
          }
          .muted {
            color: var(--dust);
          }
          .card {
            background: var(--card);
            border-radius: 18px;
            padding: 16px;
            margin-top: 16px;
          }
          .error {
            color: #ff6b6b;
          }
          @media (prefers-reduced-motion: reduce) {
            button:active {
              transform: none;
            }
          }
        </style>
      </head>
      <body>
        ${body}
      </body>
    </html>`;

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
            <button id="go" type="submit">Join the cast</button>
            <p id="err" class="error"></p>
          </form>
          <div id="done" hidden>
            <p class="eyebrow">You're in the cast</p>
            <h1>See you on screen</h1>
            <p class="muted">You can now star in ${group.name}'s videos.</p>
            <p class="card">
              Keep this link to remove your face at any time:<br /><a id="manage" href="#"></a>
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

  app.get('/m/:token', async (c) => {
    const row = await memberByToken(c.req.param('token'));
    if (!row) return c.html(page('Not found', html`<h1>This link isn't valid.</h1>`), 404);
    const [face] = await db
      .select()
      .from(faces)
      .where(and(eq(faces.memberId, row.member.id), isNull(faces.revokedAt)));
    return c.html(
      page(
        'Your face in Inside Joke',
        face
          ? html`<p class="eyebrow">Your face</p>
              <h1>${row.member.displayName} in ${row.groupName}</h1>
              <p class="muted">Your selfie can be used in this group's new videos.</p>
              <form method="post" action="/m/${c.req.param('token')}/remove">
                <button type="submit">Remove my face</button>
              </form>`
          : html`<p class="eyebrow">Your face</p>
              <h1>Your face is removed</h1>
              <p class="muted">Nobody in ${row.groupName} can use it in a new video.</p>`,
      ),
    );
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
