import { randomUUID } from 'node:crypto';
import type { Locator, Screen } from 'e2e/engine';
import { expect } from 'e2e';
import { API_PORT } from '../src/ports.ts';

const API = `http://127.0.0.1:${API_PORT}`;

/** Calls the stack's `/__e2e` routes, which act for a person or the worker. */
export async function control<T = unknown>(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}/__e2e${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** The control routes for one test user. */
export const userPath = (email: string) => `/users/${encodeURIComponent(email)}`;

export type UserState = { seen: boolean; aiConsented: boolean; hasSelfie: boolean };

/** A new Clerk test address: Clerk's development instance accepts 424242 for it, no email sent. */
export const newEmail = () => `e2e-${randomUUID().slice(0, 8)}+clerk_test@example.com`;

/** Waits for a locator, then taps it: buttons arrive with entrance animations. */
export async function tap(locator: Locator) {
  await expect(locator).toBeEnabled({ timeout: 15_000 });
  await locator.tap();
}

/**
 * From the welcome screen, signs up a new email with Clerk's test code and checks the app reached
 * the e2e API as that user, so a build pointed anywhere else stops here.
 */
export async function signUp(screen: Screen, email: string) {
  // The first launch waits for Metro to bundle the app.
  await expect(screen.getByTestId('welcome-sign-in')).toBeVisible({ timeout: 120_000 });
  await tap(screen.getByTestId('welcome-sign-in'));
  await screen.getByTestId('email').fill(email);
  // On a phone the email and code buttons sit below the fold.
  await screen.scrollUntilVisible(screen.getByTestId('send-code'), { direction: 'down' });
  await tap(screen.getByTestId('send-code'));
  await expect(screen.getByTestId('code')).toBeVisible({ timeout: 20_000 });
  await screen.getByTestId('code').fill('424242');
  await screen.scrollUntilVisible(screen.getByTestId('verify'), { direction: 'down' });
  await tap(screen.getByTestId('verify'));
  await expect
    .poll(() => control<UserState>('GET', userPath(email)), {
      timeout: 30_000,
    })
    .toMatchObject({ seen: true });
}

/** Agrees to the AI consent screen as an adult. */
export async function consent(screen: Screen) {
  await expect(screen.getByText('How your videos are made')).toBeVisible({ timeout: 20_000 });
  await tap(screen.getByTestId('consent-adult'));
  await tap(screen.getByTestId('consent-agree'));
}
