import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import { consent, control, newEmail, signUp, tap, userPath, type UserState } from './support.ts';

const skip = process.env.ANTHROPIC_API_KEY ? false : 'set ANTHROPIC_API_KEY to run agent tests';

// The photo picker is system UI with no test ids, so an agent works through it.
test(
  'a new user adds a selfie from their photos',
  { skip, timeout: 300_000 },
  async ({ app, agent, device, screen }) => {
    await device.clearKeychain();
    await app.clearState();
    const email = newEmail();
    await signUp(screen, email);
    await consent(screen);

    await tap(screen.getByTestId('selfie-pick'));
    await agent.act('pick any photo from the library and confirm the crop');
    await tap(screen.getByTestId('selfie-confirm'));
    await tap(screen.getByTestId('selfie-save'));

    await expect(screen.getByTestId('start-group')).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() => control<UserState>('GET', userPath(email)))
      .toMatchObject({ hasSelfie: true });
  },
);
