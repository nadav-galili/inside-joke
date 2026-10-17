import { sql } from 'drizzle-orm';

/** The start of the rolling 24 hours the daily caps and the spend breaker count over. */
export const oneDayAgo = sql`now() - interval '1 day'`;
