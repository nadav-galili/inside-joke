import { createDb } from '@insidejoke/db';
import { claimNextJob } from './claim.ts';
import { runJob } from './run-job.ts';
import { steps } from './steps.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
/** How long to sleep when the queue is empty. */
const IDLE_MS = 2000;

const db = createDb(databaseUrl);
let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
});

console.log('worker polling for jobs');
while (!stopping) {
  const job = await claimNextJob(db);
  if (job) {
    await runJob(db, job, steps);
  } else {
    await new Promise((resolve) => setTimeout(resolve, IDLE_MS));
  }
}
process.exit(0);
