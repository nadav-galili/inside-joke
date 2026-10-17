import { sql } from 'drizzle-orm';
import * as Sentry from '@sentry/node';
import { Hono } from 'hono';
import { requireClerkUser, type VerifyToken } from './auth.ts';
import type { Db } from '@insidejoke/db';
import { groupRoutes } from './groups.ts';
import { joinRoutes } from './join.ts';
import type { Storage } from './storage.ts';
import { revenueCatRoutes } from './revenuecat.ts';
import { legalRoutes } from './legal.ts';
import { meRoutes, type DeleteAuthUser } from './users.ts';
import { videoRoutes } from './videos.ts';

export type AppDeps = {
  verifyToken: VerifyToken;
  storage: Storage;
  /** Where this API is reached from outside, for invite links. No trailing slash. */
  publicUrl: string;
  /** The Authorization header RevenueCat sends with its webhooks. */
  revenueCatWebhookAuth: string;
  deleteAuthUser: DeleteAuthUser;
  /** Shown on the support and privacy pages; App Store Connect links to them. */
  supportEmail: string | undefined;
  /** Who is responsible for the data, with a postal address, as the privacy policy must say. */
  dataController: string | undefined;
};

export function createApp(db: Db, deps: AppDeps) {
  const app = new Hono();
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
  app.route('/', joinRoutes(db, deps.storage, deps.publicUrl));
  app.route('/', legalRoutes(deps.supportEmail, deps.dataController));

  app.route('/webhooks/revenuecat', revenueCatRoutes(db, deps.revenueCatWebhookAuth));

  const auth = requireClerkUser(deps.verifyToken);
  app.use('/me', auth);
  app.use('/me/*', auth);
  app.use('/groups', auth);
  app.use('/groups/*', auth);
  app.use('/videos', auth);
  app.use('/videos/*', auth);
  app.route('/me', meRoutes(db, deps.storage, deps.deleteAuthUser));
  app.route('/groups', groupRoutes(db, deps.publicUrl));
  app.route('/videos', videoRoutes(db, deps.storage));

  return app;
}
