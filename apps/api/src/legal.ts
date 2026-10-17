import { AI_PROVIDERS } from '@insidejoke/shared';
import { Hono } from 'hono';
import { html } from 'hono/html';
import { page } from './join.ts';

/** When the privacy policy and terms last changed. Update it with the text. */
const UPDATED = '17 October 2026';

/**
 * The privacy policy, terms and support pages. App Store Connect links to them, and so does the
 * app's settings screen.
 */
export function legalRoutes(supportEmail: string | undefined) {
  const app = new Hono();
  const contact = supportEmail
    ? html`<a href="mailto:${supportEmail}">${supportEmail}</a>`
    : html`the support page`;

  app.get('/privacy', (c) =>
    c.html(
      page(
        'Inside Joke privacy policy',
        html`<h1>Privacy policy</h1>
          <p class="muted">Last updated ${UPDATED}</p>
          <p>
            Inside Joke turns a moment from your group chat into a short comedy video starring you
            and your friends. This page says what we collect to do that, who it goes to, and how to
            delete it.
          </p>

          <h2>What we collect</h2>
          <ul>
            <li>
              <b>Your account:</b> your email address, or the anonymous address Sign in with Apple
              gives us.
            </li>
            <li>
              <b>Selfies:</b> the photo you take of yourself, and the photo each friend adds of
              themselves from an invite link, with a record of the consent they gave. Nobody can add
              a photo of someone else.
            </li>
            <li>
              <b>Chat text:</b> the part of a group chat you paste to make a video. We delete it as
              soon as you approve the script.
            </li>
            <li>
              <b>Scripts and videos:</b> the script written from the chat, and the finished video.
            </li>
            <li>
              <b>Purchases:</b> a record of each video you buy, from Apple through RevenueCat. We
              never see your card.
            </li>
            <li>
              <b>Usage and crashes:</b> which screens you use and error reports, so we can fix and
              improve the app. We don't use them for advertising or share them with advertisers.
            </li>
            <li><b>Notification token:</b> to tell you when your video is ready.</li>
          </ul>

          <h2>Who it goes to</h2>
          <p>
            The app asks for your agreement before any chat text or photo leaves your phone. To make
            a video:
          </p>
          <ul>
            ${AI_PROVIDERS.map((p) => html`<li><b>${p.name}</b> gets ${p.receives}.</li>`)}
          </ul>
          <p>
            We also use Clerk for sign-in, Cloudflare R2 to store selfies and videos, Railway to run
            our servers, RevenueCat for purchases, Expo for notifications, PostHog for usage
            analytics and Sentry for crash reports. Each one handles the data only to provide its
            service to us. We don't sell your data, and we don't track you across other apps or
            websites.
          </p>

          <h2>How long we keep it</h2>
          <ul>
            <li>Chat text: until you approve the script, or delete the video.</li>
            <li>
              Selfies: until the person removes their face, or the group's creator deletes their
              account.
            </li>
            <li>Videos and scripts: until the video is deleted.</li>
            <li>Everything else: until you delete your account.</li>
          </ul>

          <h2>Your choices</h2>
          <ul>
            <li>Remove your face at any time in Settings. It can't be used in any new video.</li>
            <li>Delete any video you made from its screen.</li>
            <li>
              Friends who joined from an invite link can remove their face, or take down any video
              they're in, from the private link they got when they joined.
            </li>
            <li>
              Delete your account in Settings. It deletes your selfie, your groups with the friends'
              selfies in them, and every video you made.
            </li>
          </ul>

          <h2>Age</h2>
          <p>Inside Joke is for people 18 and older.</p>

          <h2>Contact</h2>
          <p>Questions or requests about your data: ${contact}.</p>`,
      ),
    ),
  );

  app.get('/terms', (c) =>
    c.html(
      page(
        'Inside Joke terms of use',
        html`<h1>Terms of use</h1>
          <p class="muted">Last updated ${UPDATED}</p>
          <p>By using Inside Joke you agree to these terms.</p>
          <ul>
            <li>You must be 18 or older.</li>
            <li>
              Only add your own face. Every friend in a video adds their own selfie and agrees to be
              in it.
            </li>
            <li>
              Only paste chats you're part of, and don't make videos that harass, sexualise,
              threaten or mislead about a real person. We check finished videos and may refuse to
              deliver one.
            </li>
            <li>
              Videos are AI-generated comedy and are labelled that way. Don't remove the label or
              present a video as real footage.
            </li>
            <li>
              Videos are bought one at a time through the App Store. If a paid video fails, you get
              the video back to use again. Refunds are handled by Apple.
            </li>
            <li>
              We may remove a video that a person in it asks us to take down, and close accounts
              that break these terms.
            </li>
            <li>
              The app is provided as is. Apple's standard licence agreement for apps also applies.
            </li>
          </ul>
          <p>Contact: ${contact}.</p>`,
      ),
    ),
  );

  app.get('/support', (c) =>
    c.html(
      page(
        'Inside Joke support',
        html`<h1>Support</h1>
          <p>Need help with Inside Joke, or want a video taken down? Write to ${contact}.</p>
          <p>
            Friends who joined from an invite link can remove their face, or any video they're in,
            from the private link they got when they joined.
          </p>
          <p><a href="/privacy">Privacy policy</a> · <a href="/terms">Terms of use</a></p>`,
      ),
    ),
  );

  return app;
}
