import { anthropic } from '@ai-sdk/anthropic';
import { mobile } from '@e2e-dev/mobile';
import { mobileTools } from '@e2e-dev/mobile/tools';
import { existsSync } from 'node:fs';
import type { E2EConfig } from 'e2e';
import { METRO_PORT } from './src/ports.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const ios = mobile({ platform: 'ios' });

export default {
  targets: [
    {
      name: 'ios',
      engine: ios,
      app: {
        // A development build on the simulator (README). It loads the app from the stack's Metro,
        // which points it at the local API.
        bundleId: 'com.insidejoke.app',
        launchArguments: [
          '--initialUrl',
          `http://localhost:${METRO_PORT}`,
          '-EXDevMenuShowsAtLaunch',
          'NO',
          '-EXDevMenuIsOnboardingFinished',
          'YES',
          '-EXDevMenuShowFloatingActionButton',
          'NO',
        ],
        // simctl on iOS 26 can't set the notifications permission; the app asks for it only once a
        // video is on the way, which the tests never reach.
        permissions: { photos: 'grant' },
        command: {
          executable: 'pnpm',
          args: ['stack'],
          inheritEnv: ['E2E_*'],
          startupTimeout: 180_000,
          log: '.e2e/logs/stack.log',
        },
        readyUrl: `http://localhost:${METRO_PORT}/status`,
      },
    },
  ],
  // The agent tests skip without a key; the rest never call a model.
  ...(process.env.ANTHROPIC_API_KEY
    ? {
        agents: {
          default: {
            model: anthropic('claude-sonnet-5-5'),
            tools: mobileTools(ios),
            system: 'You are testing an iOS app. Never tap Roll camera or buy anything.',
          },
        },
      }
    : {}),
  workers: 1,
} satisfies E2EConfig;
