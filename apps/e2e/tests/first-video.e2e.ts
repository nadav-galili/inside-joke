import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import { consent, control, newEmail, signUp, tap } from './support.ts';

/**
 * A new user's first video, up to the ticket: sign up, consent, selfie, group, friends, the moment,
 * the script. It stops before Roll camera, and checks that no generation job was ever picked up.
 */
test(
  'a new user gets to their first script',
  { timeout: 300_000 },
  async ({ app, device, screen }) => {
    // A fresh keychain, so the last test's Clerk session doesn't sign this one in.
    await device.clearKeychain();
    await app.clearState();
    const email = newEmail();
    await signUp(screen, email);
    await consent(screen);

    // The selfie comes from the photo picker, which the agent test covers. Seed it, then relaunch.
    await expect(screen.getByText('Star in your videos')).toBeVisible({ timeout: 20_000 });
    await control('POST', `/users/${encodeURIComponent(email)}/selfie`);
    await app.restart();

    await tap(screen.getByTestId('start-group'));
    await screen.getByTestId('group-name').fill('Pizza Night');
    await screen.getByTestId('my-name').fill('Dani');
    await tap(screen.getByTestId('create-group'));
    await expect(screen.getByText('Invite friends to cast')).toBeVisible({ timeout: 20_000 });

    // Two friends join from the web invite page, then the group screen is opened afresh.
    await control('POST', `/users/${encodeURIComponent(email)}/friends`, { names: ['Ziv', 'Noa'] });
    await app.restart();
    await tap(screen.getByRole('button', /Pizza Night/));
    await tap(screen.getByTestId('make-video'));

    await expect(screen.getByTestId('write-script')).toHaveText('Paste the moment first');
    await screen.getByTestId('moment').fill('Ziv: who ate the last slice?\nNoa: not me\nDani: 👀');
    await device.dismissKeyboard();
    await screen.scrollUntilVisible(screen.getByTestId('genre-telenovela'));
    await tap(screen.getByTestId('genre-telenovela'));
    await screen.scrollUntilVisible(screen.getByTestId('cast-Ziv'));
    await tap(screen.getByTestId('cast-Ziv'));
    await tap(screen.getByTestId('cast-Noa'));
    await expect(screen.getByTestId('write-script')).toHaveText('Write the script');
    await tap(screen.getByTestId('write-script'));

    // No worker runs, so the script waits until the test writes it in the worker's place.
    await expect(screen.getByText('Writing the script').first()).toBeVisible({ timeout: 20_000 });
    await control('POST', `/users/${encodeURIComponent(email)}/script`);
    await expect(screen.getByText('The Group Chat').first()).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByTestId('roll-camera')).toBeVisible();
    await expect(screen.getByRole('button', 'Roll camera, Free')).toBeVisible();

    // Only the script step was ever queued, and nothing picked it up.
    const jobs = await control('GET', `/users/${encodeURIComponent(email)}/jobs`);
    expect(jobs).toEqual([{ step: 'script', status: 'queued' }]);
  },
);
