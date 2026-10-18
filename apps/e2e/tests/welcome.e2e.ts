import { expect, test } from 'e2e';
import { tap } from './support.ts';

// Before sign-in the app makes no API calls, so this checks the tour and the sign-in screen alone.
test('the welcome tour leads to sign-in', async ({ app, screen }) => {
  await app.open();
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
  await expect(screen.getByTestId('email')).toBeVisible();
  await expect(screen.getByTestId('send-code')).toBeDisabled();
});
