import { randomUUID } from 'node:crypto';
import type { Device } from '@e2e-dev/mobile';
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
  await expect(locator).toBeEnabled({ timeout: process.env.CI ? 45_000 : 15_000 });
  await locator.tap();
}

/**
 * Types into a field. On a hosted Mac the simulator's automation runner sometimes overruns its
 * watchdog while the keyboard comes up; the field is untouched then, so one more try is safe.
 */
export async function fill(locator: Locator, text: string) {
  try {
    await locator.fill(text);
  } catch (err) {
    if (!String(err).includes('overran its watchdog')) throw err;
    await new Promise((r) => setTimeout(r, 5_000));
    await locator.fill(text);
  }
}

/**
 * Closes the on-screen keyboard (CI has no hardware one) by tapping a heading: the app's scroll
 * views dismiss it on a tap that lands on nothing interactive. iOS's email and multi-line keyboards
 * have no key to close them.
 */
export async function tapAway(heading: Locator) {
  await heading.first().tap({ position: { x: 4, y: 4 } });
}

/** iOS asks once the app wants to notify, which it does as soon as a user is onboarded. */
const NOTIFICATIONS_PROMPT = /Would Like to Send You Notifications/;

/**
 * Waits for `target`, declining the notifications prompt if it covers the app on the way: the app
 * asks once a user is onboarded, and a prompt left by a failed attempt stays over the next launch.
 * The target must stay up a few seconds with no prompt, since the prompt can follow it in.
 */
export async function waitPastPrompts(
  screen: Screen,
  device: Device,
  target: Locator,
  timeout = 120_000,
) {
  const prompt = screen.getByText(NOTIFICATIONS_PROMPT);
  const deadline = Date.now() + timeout;
  let shownSince: number | undefined;
  while (Date.now() < deadline) {
    if (await prompt.isVisible()) {
      await device.alert('dismiss');
      shownSince = undefined;
    } else if (await target.isVisible()) {
      shownSince ??= Date.now();
      if (Date.now() - shownSince > 5_000) return;
    } else {
      shownSince = undefined;
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  await expect(target).toBeVisible();
}

/**
 * From the welcome screen, signs up a new email with Clerk's test code and checks the app reached
 * the e2e API as that user, so a build pointed anywhere else stops here.
 */
export async function signUp(screen: Screen, device: Device, email: string) {
  // The first launch waits for Metro to bundle the app.
  await waitPastPrompts(screen, device, screen.getByTestId('welcome-sign-in'));
  await tap(screen.getByTestId('welcome-sign-in'));
  // On a phone the email field and the buttons under it sit below the fold.
  await screen.scrollUntilVisible(screen.getByTestId('email'), { direction: 'down' });
  await fill(screen.getByTestId('email'), email);
  // The on-screen keyboard stops the form from scrolling to its button.
  await tapAway(screen.getByText(/Take your seat/));
  await screen.scrollUntilVisible(screen.getByTestId('send-code'), { direction: 'down' });
  await tap(screen.getByTestId('send-code'));
  await expect(screen.getByTestId('code')).toBeVisible({ timeout: 20_000 });
  await fill(screen.getByTestId('code'), '424242');
  await tapAway(screen.getByText(/Take your seat/));
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
