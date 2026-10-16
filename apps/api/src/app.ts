import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireClerkUser, type VerifyToken } from './auth.ts';
import type { Db } from '@insidejoke/db';
import { videoRoutes } from './videos.ts';

export type AppDeps = { verifyToken: VerifyToken };

export function createApp(db: Db, deps: AppDeps) {
  const app = new Hono();

  app.get('/health', async (c) => {
    await db.execute(sql`select 1`);
    return c.json({ ok: true, sha: process.env.GIT_SHA ?? 'unknown' });
  });

  app.use('/videos/*', requireClerkUser(deps.verifyToken));
  app.route('/videos', videoRoutes(db));

  return app;
}
