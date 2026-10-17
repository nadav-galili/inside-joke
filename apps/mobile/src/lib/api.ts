import { useAuth } from '@clerk/expo';
import { useCallback, useEffect, useRef, useState } from 'react';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/** What the app says when the API turns a request down for one of its daily caps, by error code. */
export const LIMIT_MESSAGES: Record<string, string> = {
  daily_limit: "That's all the scripts for today. Come back tomorrow for more.",
  free_limit: "Today's free videos are all taken. Yours is saved for tomorrow.",
};

/** A non-2xx answer from the API, with its status and error code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    path: string,
  ) {
    super(`${path} failed: ${status}${code ? ` ${code}` : ''}`);
  }
}

/** Calls the API with the signed-in user's Clerk session token. */
export async function api<T>(
  path: string,
  getToken: () => Promise<string | null>,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  // 402 carries a body the caller acts on (the user has to buy the video).
  if (!res.ok && res.status !== 402) throw new ApiError(res.status, body?.error, path);
  return body as T;
}

/** `api` bound to the current session. The function stays the same across renders. */
export function useApi() {
  const { getToken } = useAuth();
  // @clerk/expo hands back a new getToken on every render. Depending on it directly made every
  // useResource refetch on every render, in a loop.
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  return useCallback(
    <T>(path: string, init?: RequestInit) => api<T>(path, () => tokenRef.current(), init),
    [],
  );
}

/**
 * Loads `path` and keeps it fresh: reloads on demand, and every `pollMs` while `poll` says the
 * data is still changing.
 */
export function useResource<T>(
  path: string | null,
  opts: { pollMs?: number; poll?: (data: T) => boolean } = {},
) {
  const call = useApi();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(opts.poll);
  pollRef.current = opts.poll;

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await call<T>(path));
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [call, path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!opts.pollMs || data === null || !pollRef.current?.(data)) return;
    const t = setTimeout(() => void reload(), opts.pollMs);
    return () => clearTimeout(t);
  }, [data, opts.pollMs, reload]);

  return { data, error, loading, reload, setData };
}
