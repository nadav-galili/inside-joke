import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import {
  consent,
  control,
  fill,
  newEmail,
  signUp,
  tap,
  tapAway,
  userPath,
  waitPastPrompts,
} from './support.ts';

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
    await signUp(screen, device, email);
    await consent(screen);

    // The selfie comes from the photo picker, which the agent test covers. Seed it, then relaunch.
    await expect(screen.getByText('Star in your videos')).toBeVisible({ timeout: 20_000 });
    await control('POST', `${userPath(email)}/selfie`);
    await app.restart();

    // A relaunch reloads the app from Metro, which takes a while on a hosted Mac. Home is where an
    // onboarded user is first asked for notifications.
    await waitPastPrompts(screen, device, screen.getByTestId('start-group'));
    await tap(screen.getByTestId('start-group'));
    await fill(screen.getByTestId('group-name'), 'Pizza Night');
    await fill(screen.getByTestId('my-name'), 'Dani');
    await tap(screen.getByTestId('create-group'));
    await expect(screen.getByText('Invite friends to cast')).toBeVisible({ timeout: 20_000 });

    // Two friends join from the web invite page, then the group screen is opened afresh.
    await control('POST', `${userPath(email)}/friends`, { names: ['Ziv', 'Noa'] });
    await app.restart();
    await waitPastPrompts(screen, device, screen.getByRole('button', /Pizza Night/));
    await tap(screen.getByRole('button', /Pizza Night/));
    await tap(screen.getByTestId('make-video'));

    await expect(screen.getByTestId('write-script')).toHaveText('Paste the moment first');
    await fill(screen.getByTestId('moment'), 'Ziv: who ate the last slice?\nNoa: not me\nDani: 👀');
    await tapAway(screen.getByText('What happened?'));
    await screen.scrollUntilVisible(screen.getByTestId('genre-telenovela'));
    await tap(screen.getByTestId('genre-telenovela'));
    await screen.scrollUntilVisible(screen.getByTestId('cast-Ziv'));
    await tap(screen.getByTestId('cast-Ziv'));
    await tap(screen.getByTestId('cast-Noa'));
    await expect(screen.getByTestId('write-script')).toHaveText('Write the script');
    await tap(screen.getByTestId('write-script'));

    // No worker runs, so the script waits until the test writes it in the worker's place.
    await expect(screen.getByText('Writing the script').first()).toBeVisible({ timeout: 20_000 });
    await control('POST', `${userPath(email)}/script`);
    await expect(screen.getByText('The Group Chat').first()).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByTestId('roll-camera')).toBeVisible();
    await expect(screen.getByRole('button', 'Roll camera, Free')).toBeVisible({ timeout: 20_000 });

    // Only the script step was ever queued, and nothing picked it up.
    const jobs = await control('GET', `${userPath(email)}/jobs`);
    expect(jobs).toEqual([{ step: 'script', status: 'queued' }]);
  },
);
