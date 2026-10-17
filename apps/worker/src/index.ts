import { createDb } from '@insidejoke/db';
import * as Sentry from '@sentry/node';
import { claimNextJob } from './claim.ts';
import { expoNotify } from './notify.ts';
import { claudeModerator, claudeScriptModerator } from './providers/moderator.ts';
import { claudeScriptWriter } from './providers/script-writer.ts';
import { falVideoGenerator } from './providers/video-generator.ts';
import { sweepExpiredData } from './retention.ts';
import { runJob } from './run-job.ts';
import { createSteps } from './steps.ts';
import { r2Storage } from './storage.ts';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

if (process.env.SENTRY_DSN) Sentry.init({ dsn: process.env.SENTRY_DSN });

const db = createDb(required('DATABASE_URL'));
// The Anthropic client reads ANTHROPIC_API_KEY itself; fail at start rather than on the first job.
required('ANTHROPIC_API_KEY');
const storage = r2Storage({
  accountId: required('R2_ACCOUNT_ID'),
  bucket: required('R2_BUCKET'),
  accessKeyId: required('R2_ACCESS_KEY_ID'),
  secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
});
const steps = createSteps(db, {
  writeScript: claudeScriptWriter(),
  generateVideo: falVideoGenerator(required('FAL_KEY')),
  moderate: claudeModerator(),
  moderateScript: claudeScriptModerator(),
  storage,
});
const notify = expoNotify(db);
/** How long to sleep when the queue is empty. */
const IDLE_MS = 2000;
/** How often expired chat text and unused files are deleted. */
const SWEEP_EVERY_MS = 60 * 60 * 1000;
let lastSweep = 0;

async function sweep() {
  lastSweep = Date.now();
  try {
    console.log('retention sweep', await sweepExpiredData(db, storage));
  } catch (e) {
    console.error('retention sweep failed', e);
    Sentry.captureException(e, { tags: { task: 'retention' } });
  }
}

let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
});

console.log('worker polling for jobs');
while (!stopping) {
  if (Date.now() - lastSweep >= SWEEP_EVERY_MS) await sweep();
  const job = await claimNextJob(db);
  if (job) {
    await runJob(db, job, steps, notify);
  } else {
    await new Promise((resolve) => setTimeout(resolve, IDLE_MS));
  }
}
process.exit(0);
