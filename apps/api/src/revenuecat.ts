import { VIDEO_PRODUCT_ID } from '@insidejoke/shared';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { purchases, users, type Db } from '@insidejoke/db';

/** The fields of a RevenueCat webhook event this API uses; the whole event is kept as sent. */
const eventSchema = z.object({
  event: z.object({
    type: z.string(),
    app_user_id: z.string(),
    product_id: z.string().optional(),
    transaction_id: z.string().optional(),
    cancel_reason: z.string().optional(),
  }),
});

const uuid = z.string().uuid();

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * RevenueCat tells the API about each Apple purchase. A bought video becomes a credit on the
 * account (the app logs in to RevenueCat with our user id), and approving a script spends it.
 * Each transaction counts once, however often RevenueCat retries.
 */
export function revenueCatRoutes(db: Db, authHeader: string) {
  const app = new Hono();

  app.post('/', async (c) => {
    if (!sameSecret(c.req.header('authorization') ?? '', authHeader)) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const raw: unknown = await c.req.json().catch(() => null);
    const parsed = eventSchema.safeParse(raw);
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const { type, app_user_id, product_id, transaction_id, cancel_reason } = parsed.data.event;

    // Anything else (test events, other products, anonymous ids) is acknowledged and ignored, so
    // RevenueCat doesn't keep retrying it.
    if (
      product_id !== VIDEO_PRODUCT_ID ||
      !transaction_id ||
      !uuid.safeParse(app_user_id).success
    ) {
      return c.json({ ok: true, ignored: true });
    }
    const [user] = await db.select().from(users).where(eq(users.id, app_user_id));
    if (!user) {
      console.error(`revenuecat event for unknown user ${app_user_id}`);
      return c.json({ ok: true, ignored: true });
    }

    if (type === 'NON_RENEWING_PURCHASE') {
      await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(purchases)
          .values({
            userId: user.id,
            productId: product_id,
            transactionId: transaction_id,
            rawEvent: raw,
          })
          .onConflictDoNothing({ target: purchases.transactionId })
          .returning({ id: purchases.id });
        if (inserted.length === 0) return;
        await tx
          .update(users)
          .set({ videoCredits: sql`${users.videoCredits} + 1` })
          .where(eq(users.id, user.id));
      });
    } else if (type === 'CANCELLATION' && cancel_reason === 'CUSTOMER_SUPPORT') {
      // Apple refunded the purchase: take back the credit if it hasn't been spent yet.
      console.warn(`refund for transaction ${transaction_id}`);
      await db
        .update(users)
        .set({ videoCredits: sql`greatest(${users.videoCredits} - 1, 0)` })
        .where(eq(users.id, user.id));
    }
    return c.json({ ok: true });
  });

  return app;
}
