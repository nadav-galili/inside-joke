import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireClerkUser, type VerifyToken } from './auth.ts';
import type { Db } from '@insidejoke/db';
import { groupRoutes } from './groups.ts';
import { joinRoutes } from './join.ts';
import type { Storage } from './storage.ts';
import { meRoutes } from './users.ts';
import { videoRoutes } from './videos.ts';

export type AppDeps = {
  verifyToken: VerifyToken;
  storage: Storage;
  /** Where this API is reached from outside, for invite links. No trailing slash. */
  publicUrl: string;
};

export function createApp(db: Db, deps: AppDeps) {
  const app = new Hono();

  app.get('/health', async (c) => {
    await db.execute(sql`select 1`);
    return c.json({ ok: true, sha: process.env.GIT_SHA ?? 'unknown' });
  });

  // The invite and manage pages are public: friends open them from the group chat.
  app.route('/', joinRoutes(db, deps.storage, deps.publicUrl));

  const auth = requireClerkUser(deps.verifyToken);
  app.use('/me', auth);
  app.use('/me/*', auth);
  app.use('/groups', auth);
  app.use('/groups/*', auth);
  app.use('/videos', auth);
  app.use('/videos/*', auth);
  app.route('/me', meRoutes(db, deps.storage));
  app.route('/groups', groupRoutes(db, deps.publicUrl));
  app.route('/videos', videoRoutes(db, deps.storage));

  return app;
}
