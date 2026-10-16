import { verifyToken as clerkVerify } from '@clerk/backend';
import type { MiddlewareHandler } from 'hono';

/** Resolves a bearer token to a Clerk user id, or null when it is not a valid session token. */
export type VerifyToken = (token: string) => Promise<string | null>;

export function clerkVerifyToken(secretKey: string): VerifyToken {
  return async (token) => {
    try {
      const claims = await clerkVerify(token, { secretKey });
      return claims.sub;
    } catch (e) {
      console.error('clerk token verification failed', e);
      return null;
    }
  };
}

export type AuthVariables = { clerkUserId: string };

export function requireClerkUser(
  verifyToken: VerifyToken,
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const clerkUserId = token ? await verifyToken(token) : null;
    if (!clerkUserId) return c.json({ error: 'unauthorized' }, 401);
    c.set('clerkUserId', clerkUserId);
    await next();
  };
}
