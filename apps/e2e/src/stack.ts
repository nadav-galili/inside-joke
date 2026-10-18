import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClerkClient } from '@clerk/backend';
import { serve } from '@hono/node-server';
import { createDb, runMigrations } from '@insidejoke/db';
import { sql } from 'drizzle-orm';
import { clerkVerifyToken } from '../../api/src/auth.ts';
import { createE2eApi } from './api.ts';
import { API_PORT, METRO_PORT } from './ports.ts';

/**
 * What the simulator tests run against: the API on a throwaway local database, and Metro serving
 * the app pointed at it. No worker starts, so nothing is generated, and the guards below refuse
 * production keys and remote databases.
 */

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required: see apps/e2e/README.md`);
  return value;
}

const publishableKey = required('E2E_CLERK_PUBLISHABLE_KEY');
const secretKey = required('E2E_CLERK_SECRET_KEY');
// Test users go to Clerk's development instance only, never to the production one.
if (!publishableKey.startsWith('pk_test_') || !secretKey.startsWith('sk_test_')) {
  throw new Error('E2E_CLERK_* must be the development instance keys (pk_test_, sk_test_)');
}

const databaseUrl = new URL(
  process.env.E2E_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5499/insidejoke_e2e',
);
if (!['localhost', '127.0.0.1'].includes(databaseUrl.hostname)) {
  throw new Error(`E2E_DATABASE_URL must be a local database, not ${databaseUrl.hostname}`);
}

const name = databaseUrl.pathname.slice(1);
const admin = new URL(databaseUrl);
admin.pathname = '/postgres';
const adminDb = createDb(admin.toString());
const exists = await adminDb.execute(sql`select 1 from pg_database where datname = ${name}`);
if (exists.length === 0) await adminDb.execute(sql.raw(`create database "${name}"`));
await adminDb.$client.end();

const db = createDb(databaseUrl.toString());
await runMigrations(db);

// 127.0.0.1, as the server binds, so nothing resolves localhost to IPv6 and misses it.
const publicUrl = `http://127.0.0.1:${API_PORT}`;
const clerk = createClerkClient({ secretKey });
const app = createE2eApi(db, {
  publicUrl,
  verifyToken: clerkVerifyToken(secretKey),
  findClerkUser: async (email) => {
    const { data } = await clerk.users.getUserList({ emailAddress: [email] });
    return data[0]?.id ?? null;
  },
  deleteAuthUser: async (id) => {
    await clerk.users.deleteUser(id);
  },
});
// The runner waits for this before launching the app (e2e.config.ts `readyUrl`), so the first launch
// doesn't sit on a cold bundle while the tests time out.
let bundled = false;
serve(
  {
    fetch: (req) =>
      new URL(req.url).pathname === '/__e2e/ready'
        ? new Response(bundled ? 'ok' : 'bundling', { status: bundled ? 200 : 503 })
        : app.fetch(req),
    port: API_PORT,
    hostname: '127.0.0.1',
  },
  () => {
    console.log(`e2e api on ${publicUrl}, database ${name}`);
  },
);

// Only what the app needs: no .env files, so no production key, analytics, RevenueCat or Sentry.
const appEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([k]) => !k.startsWith('EXPO_PUBLIC_') && !k.startsWith('E2E_'),
  ),
);
const metro = spawn(
  'pnpm',
  ['exec', 'expo', 'start', '--dev-client', '--clear', '--port', String(METRO_PORT)],
  {
    cwd: fileURLToPath(new URL('../../mobile', import.meta.url)),
    stdio: 'inherit',
    env: {
      ...appEnv,
      EXPO_NO_DOTENV: '1',
      EXPO_PUBLIC_API_URL: publicUrl,
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey,
    },
  },
);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => metro.kill(signal));
}
metro.on('exit', (code) => process.exit(code ?? 0));

/** Builds the bundle the dev client will ask for: the one the manifest names, so the cache matches. */
async function prewarm() {
  const metroUrl = `http://127.0.0.1:${METRO_PORT}`;
  for (;;) {
    const up = await fetch(`${metroUrl}/status`).then(
      (r) => r.ok,
      () => false,
    );
    if (up) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const manifest = (await fetch(metroUrl, {
    headers: { 'expo-platform': 'ios', accept: 'application/expo+json,application/json' },
  }).then((r) => r.json())) as { launchAsset: { url: string } };
  const started = Date.now();
  const res = await fetch(manifest.launchAsset.url);
  await res.arrayBuffer();
  console.log(`e2e bundle ${res.status} in ${Math.round((Date.now() - started) / 1000)}s`);
}
prewarm()
  .catch((err: unknown) => console.error('e2e bundle prewarm failed, the app will build it', err))
  .finally(() => {
    bundled = true;
  });
