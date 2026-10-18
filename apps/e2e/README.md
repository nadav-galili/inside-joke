# End-to-end tests

The app on the iOS Simulator, driven by [e2e](https://github.com/tester-army/e2e). The tests sign up a
new user and take them through consent, selfie, a group, friends joining and a new video, up to the
script and its ticket. They never tap Roll camera.

## What they run against

`pnpm stack` (started by the runner) brings up:

- the real API (`apps/api`) on `localhost:3100`, on a local Postgres database it creates,
  with photos kept in memory instead of R2;
- Metro on `localhost:8082`, serving the app pointed at that API, with no `.env` file read, so no
  production key, analytics, RevenueCat or Sentry.

The worker never starts, so no script or video is ever generated and nothing is paid for. Where the
flow needs a person or the worker (the photo picker, friends joining from the web, the script
being written), the tests call `/__e2e/*` routes on the local API that do it directly. The stack
refuses production Clerk keys and any database that is not on `localhost`.

## Set up once

1. A Mac with Xcode and an iOS simulator. Node 22.22.3 or newer (`e2e` needs it).
2. Postgres on `localhost:5499` (the one the API tests use), or set `E2E_DATABASE_URL`:
   `docker run -d -p 5499:5432 -e POSTGRES_PASSWORD=postgres postgres:17-alpine`
3. A development build on the simulator: `pnpm --filter mobile ios` (or an EAS
   `development-simulator` build, dragged onto the simulator). This is not the App Store build and
   changes nothing in it.
4. From the repo root: `pnpm install`, then `pnpm --dir apps/e2e install --ignore-workspace`.
   The tests keep their own lockfile, so their tooling never changes what the app installs.
5. `cp apps/e2e/.env.example apps/e2e/.env` and fill in the Clerk **development** instance keys
   (`pk_test_…`, `sk_test_…`). New test users are `…+clerk_test@example.com` addresses (Clerk rejects `.test` domains), which
   Clerk's development instance signs in with the code `424242` without sending an email.

## Run

```bash
pnpm --dir apps/e2e test:ios
```

Add a file to run one, for example `pnpm --dir apps/e2e test:ios tests/welcome.e2e.ts`. Results,
logs and recordings land in `apps/e2e/.e2e/`.

`tests/selfie.e2e.ts` uses an agent to work through the system photo picker. It runs only when
`ANTHROPIC_API_KEY` is set in `.env` and is skipped otherwise; the other tests never call a model.

## In CI

`.github/workflows/e2e-ios.yml` runs the suite on a hosted Mac after every merge to `main`, and on
pull requests that change `apps/e2e`. It builds a Debug simulator app (cached until the app's
config or dependencies change), starts Postgres, and runs the same stack, so it never generates a
video either. It needs two repository secrets, the same Clerk **development** keys as `.env`:
`E2E_CLERK_PUBLISHABLE_KEY` and `E2E_CLERK_SECRET_KEY`. Reports are uploaded as the `e2e-ios`
artifact.
