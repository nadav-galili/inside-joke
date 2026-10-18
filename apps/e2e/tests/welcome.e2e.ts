import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import { tap } from './support.ts';

// Before sign-in the app makes no API calls, so this checks the tour and the sign-in screen alone.
test('the welcome tour leads to sign-in', async ({ app, device, screen }) => {
  // Signed out, whatever the last test left behind.
  await device.clearKeychain();
  await app.clearState();
  await expect(screen.getByText('Your group chat, on the big screen')).toBeVisible({
    timeout: 120_000,
  });
  for (const title of [
    'It starts with a moment',
    'Everyone plays themselves',
    'Pick a genre, approve the script',
  ]) {
    await tap(screen.getByTestId('welcome-next'));
    await expect(screen.getByText(title)).toBeVisible();
  }
  await expect(screen.getByTestId('welcome-next')).toHaveText('Make one starring your friends');
  await tap(screen.getByTestId('welcome-next'));
  // On a phone the email field and its button sit below the fold.
  await screen.scrollUntilVisible(screen.getByTestId('email'), { direction: 'down' });
  await expect(screen.getByTestId('email')).toBeVisible();
  await screen.scrollUntilVisible(screen.getByTestId('send-code'), { direction: 'down' });
  await expect(screen.getByTestId('send-code')).toBeDisabled();
});
