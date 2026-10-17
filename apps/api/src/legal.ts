import { AI_PROVIDERS } from '@insidejoke/shared';
import { Hono } from 'hono';
import { html } from 'hono/html';
import { page } from './html.ts';

/** When the privacy policy and terms last changed. Update it with the text. */
const UPDATED = '17 October 2026';

/**
 * The privacy policy, terms and support pages. App Store Connect links to them, and so does the
 * app's settings screen.
 */
export function legalRoutes(supportEmail: string | undefined, controller: string | undefined) {
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
              <b>Chat text:</b> the part of a group chat you paste to make a video. It can include
              messages from people who don't use Inside Joke, so only paste chats you're part of. We
              delete it as soon as you approve the script.
            </li>
            <li>
              <b>Scripts and videos:</b> the script written from the chat, and the finished video.
            </li>
            <li>
              <b>Purchases:</b> a record of each video you buy, from Apple through RevenueCat. We
              never see your card.
            </li>
            <li>
              <b>Usage stats, only if you turn them on:</b> which screens you use, so we can improve
              the app. They're off until you tick "Share usage stats" in Settings.
            </li>
            <li><b>Crash reports:</b> errors and the device details needed to fix them.</li>
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
            our servers, RevenueCat for purchases, Expo for notifications, PostHog for usage stats
            and Sentry for crash reports. Each one handles the data only to provide its service to
            us. We don't sell your data, we don't use it for advertising, and we don't track you
            across other apps or websites.
          </p>

          <h2>Why we use it (legal basis)</h2>
          <ul>
            <li>
              <b>Making the videos you ask for</b> (account, scripts, videos, purchases,
              notifications): to provide the service you signed up for (contract).
            </li>
            <li>
              <b>Selfies, and sending chat text and photos to the AI services:</b> your consent,
              given on the consent screen or the invite page. You can withdraw it at any time by
              removing your face or deleting your account.
            </li>
            <li><b>Usage stats:</b> your consent, through the Settings switch.</li>
            <li>
              <b>Crash reports and the safety checks on scripts and videos:</b> our legitimate
              interest in keeping the app working and stopping harmful videos.
            </li>
          </ul>

          <h2>Where it's processed</h2>
          <p>
            Our providers are based in the United States, so your data is processed there. Transfers
            from the EU, UK and Switzerland rely on the EU-US Data Privacy Framework where the
            provider is certified, and otherwise on the European Commission's Standard Contractual
            Clauses.
          </p>

          <h2>How long we keep it</h2>
          <ul>
            <li>
              Chat text: until you approve the script, and at most 7 days if you never approve it.
            </li>
            <li>
              Selfies: until the person removes their face, or the group's creator deletes their
              account. The file is deleted within a day of that.
            </li>
            <li>
              Videos and scripts: until the video is deleted. fal deletes its copy of the raw video
              after a day.
            </li>
            <li>Everything else: until you delete your account.</li>
            <li>
              Purchase records: Apple and RevenueCat keep them, as tax and accounting rules require,
              after you delete your account.
            </li>
            <li>
              Usage stats: kept by PostHog after you delete your account unless you ask us to delete
              them, which we do on request.
            </li>
          </ul>

          <h2>Your choices</h2>
          <ul>
            <li>Remove your face at any time in Settings. It can't be used in any new video.</li>
            <li>Delete any finished video you made from its screen.</li>
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

          <h2>Your rights</h2>
          <p>
            You can ask us for a copy of your data, to correct it, to delete it, to limit or object
            to how we use it, or to receive it in a portable format, and you can withdraw consent at
            any time. Write to ${contact}. If you're in the EU, UK or Switzerland, you can also
            complain to your local data protection authority.
          </p>

          <h2>Who we are</h2>
          <p>
            ${controller ? html`${controller} is` : html`We are`} responsible for your data (the
            data controller). Questions or requests about your data: ${contact}.
          </p>`,
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
