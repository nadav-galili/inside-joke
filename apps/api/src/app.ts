import { sql } from 'drizzle-orm';
import * as Sentry from '@sentry/node';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { requireClerkUser, type AuthVariables, type VerifyToken } from './auth.ts';
import type { Db } from '@insidejoke/db';
import { groupRoutes } from './groups.ts';
import { joinRoutes } from './join.ts';
import { clientIp, DEFAULT_RATE_LIMITS, rateLimit, type RateLimits } from './limits.ts';
import type { Storage } from './storage.ts';
import { revenueCatRoutes } from './revenuecat.ts';
import { meRoutes } from './users.ts';
import { videoRoutes } from './videos.ts';

export type AppDeps = {
  verifyToken: VerifyToken;
  storage: Storage;
  /** Where this API is reached from outside, for invite links. No trailing slash. */
  publicUrl: string;
  /** The Authorization header RevenueCat sends with its webhooks. */
  revenueCatWebhookAuth: string;
  rateLimits?: RateLimits;
  /** Free videos all accounts together may start per day, so new sign-ups can't run up fal. */
  freeVideosPerDay?: number;
};

/** Requests are small JSON: chat text is capped at a few thousand characters. */
const MAX_BODY_BYTES = 64 * 1024;
export const DEFAULT_FREE_VIDEOS_PER_DAY = 20;

export function createApp(db: Db, deps: AppDeps) {
  const limits = deps.rateLimits ?? DEFAULT_RATE_LIMITS;
  const app = new Hono<{ Variables: AuthVariables }>();
  // No referrer, so a manage link's secret token never leaks to another site; no framing either.
  app.use(secureHeaders());
  app.use(
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: 'body_too_large' }, 413),
    }),
  );
  app.onError((err, c) => {
    console.error(err);
    Sentry.captureException(err);
    return c.json({ error: 'internal' }, 500);
  });

  app.get('/health', async (c) => {
    await db.execute(sql`select 1`);
    return c.json({ ok: true, sha: process.env.GIT_SHA ?? 'unknown' });
  });

  // The invite and manage pages are public: friends open them from the group chat.
  const perIp = rateLimit(limits.public, clientIp);
  app.use('/join/*', perIp);
  app.use('/m/*', perIp);
  app.route('/', joinRoutes(db, deps.storage, deps.publicUrl));

  app.route('/webhooks/revenuecat', revenueCatRoutes(db, deps.revenueCatWebhookAuth));

  const auth = requireClerkUser(deps.verifyToken);
  const perUser = rateLimit(limits.user, (c) => c.get('clerkUserId'));
  // `/me/*` also matches `/me` itself, so each request is verified and counted once.
  for (const path of ['/me/*', '/groups/*', '/videos/*']) {
    app.use(path, auth, perUser);
  }
  app.route('/me', meRoutes(db, deps.storage));
  app.route('/groups', groupRoutes(db, deps.publicUrl));
  app.route(
    '/videos',
    videoRoutes(db, deps.storage, deps.freeVideosPerDay ?? DEFAULT_FREE_VIDEOS_PER_DAY),
  );

  return app;
}
