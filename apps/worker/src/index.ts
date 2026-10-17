import { createDb } from '@insidejoke/db';
import * as Sentry from '@sentry/node';
import { BUDGET_CHECK_MS, dailySpendLimit, spentInLastDay } from './budget.ts';
import { claimNextJob, REAP_MS, requeueStaleJobs, STALE_AFTER_SECONDS } from './claim.ts';
import { expoNotify } from './notify.ts';
import { claudeModerator } from './providers/moderator.ts';
import { claudeScriptWriter } from './providers/script-writer.ts';
import { falVideoGenerator } from './providers/video-generator.ts';
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
const steps = createSteps(db, {
  writeScript: claudeScriptWriter(),
  generateVideo: falVideoGenerator(required('FAL_KEY')),
  moderate: claudeModerator(),
  storage: r2Storage({
    accountId: required('R2_ACCOUNT_ID'),
    bucket: required('R2_BUCKET'),
    accessKeyId: required('R2_ACCESS_KEY_ID'),
    secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
  }),
});
const notify = expoNotify(db);
/** How long to sleep when the queue is empty. */
const IDLE_MS = 2000;

let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
});

let lastReap = 0;

const spendLimit = dailySpendLimit();
let lastBudgetCheck = 0;
let overBudget = false;
/**
 * A circuit breaker on provider spend: past the day's limit the worker only films videos people
 * bought, and leaves scripts and free videos queued, so a flood of sign-ups or a bug can't run up
 * fal and Anthropic. The rest resumes as the 24-hour window moves on.
 */
async function checkBudget() {
  lastBudgetCheck = Date.now();
  const spent = await spentInLastDay(db);
  const over = spent >= spendLimit;
  if (over && !overBudget) {
    const message = `worker paused: $${spent.toFixed(2)} spent in 24h, limit $${spendLimit}`;
    console.error(message);
    Sentry.captureMessage(message, 'fatal');
  } else if (!over && overBudget) {
    console.warn(`worker resumed: $${spent.toFixed(2)} spent in 24h`);
  }
  overBudget = over;
}

console.log(`worker daily spend limit $${spendLimit}`);

console.log('worker polling for jobs');
while (!stopping) {
  if (Date.now() - lastReap > REAP_MS) {
    lastReap = Date.now();
    const requeued = await requeueStaleJobs(db, STALE_AFTER_SECONDS);
    if (requeued.length > 0)
      console.warn(`requeued jobs a stopped worker left: ${requeued.join(', ')}`);
  }
  if (Date.now() - lastBudgetCheck > BUDGET_CHECK_MS) await checkBudget();
  const job = await claimNextJob(db, { paidOnly: overBudget });
  if (job) {
    await runJob(db, job, steps, notify);
  } else {
    await new Promise((resolve) => setTimeout(resolve, IDLE_MS));
  }
}
process.exit(0);
