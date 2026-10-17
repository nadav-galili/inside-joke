import { generationJobs, oneDayAgo, type Db } from '@insidejoke/db';
import { and, eq, gt, sum } from 'drizzle-orm';

/** What the worker may spend on AI providers in any 24 hours before it stops taking jobs. */
export const DEFAULT_DAILY_SPEND_LIMIT_USD = 50;
/** How often the worker re-adds the day's spend. */
export const BUDGET_CHECK_MS = 60_000;

/** USD the finished steps of the last 24 hours cost, as the steps reported it. */
export async function spentInLastDay(db: Db): Promise<number> {
  const [row] = await db
    .select({ usd: sum(generationJobs.costUsd) })
    .from(generationJobs)
    .where(and(eq(generationJobs.status, 'done'), gt(generationJobs.updatedAt, oneDayAgo)));
  return Number(row?.usd ?? 0);
}

/** The limit from `DAILY_SPEND_LIMIT_USD`, or the default when it is unset or not a number. */
export function dailySpendLimit(value = process.env.DAILY_SPEND_LIMIT_USD): number {
  const limit = Number(value);
  return value && Number.isFinite(limit) && limit >= 0 ? limit : DEFAULT_DAILY_SPEND_LIMIT_USD;
}
