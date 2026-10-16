import { serve } from '@hono/node-server';
import * as Sentry from '@sentry/node';
import { createApp } from './app.ts';
import { clerkVerifyToken } from './auth.ts';
import { createDb, runMigrations } from '@insidejoke/db';
import { r2Storage } from './storage.ts';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

if (process.env.SENTRY_DSN) Sentry.init({ dsn: process.env.SENTRY_DSN });

const port = Number(process.env.PORT ?? 3000);
const db = createDb(required('DATABASE_URL'));
await runMigrations(db);

const app = createApp(db, {
  verifyToken: clerkVerifyToken(required('CLERK_SECRET_KEY')),
  storage: r2Storage({
    accountId: required('R2_ACCOUNT_ID'),
    bucket: required('R2_BUCKET'),
    accessKeyId: required('R2_ACCESS_KEY_ID'),
    secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
  }),
  publicUrl: required('PUBLIC_URL').replace(/\/$/, ''),
  revenueCatWebhookAuth: required('REVENUECAT_WEBHOOK_AUTH'),
});
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`api listening on :${info.port}`);
});
