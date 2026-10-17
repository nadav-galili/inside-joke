# Inside Joke

An iOS app that turns a group-chat moment into a 15-second funny video starring the friends in it.
Each friend opts in with their own selfie. Videos are sold one at a time ($4.99) through Apple
in-app purchase via RevenueCat.

Build plan: https://claude.ai/code/artifact/7840814d-7dfa-4910-87e4-fc031bb5c754

## Layout

The same stack as Mibo (nadav-galili/chores): a pnpm + Turborepo monorepo on Node 22.

- `apps/mobile`: Expo (React Native) app with expo-router and Clerk.
- `apps/api`: Hono API on Railway. Clerk auth, creates videos and queues their jobs.
- `apps/worker`: background worker on Railway. Claims `generation_jobs` rows with
  `FOR UPDATE SKIP LOCKED` and runs three steps: `script` (Claude writes the scene from the chat),
  `video` (MiniMax H3 on fal makes one 15s take from the cast's selfies) and `finish` (ffmpeg burns
  in subtitles and the watermark, then uploads to R2).
- `packages/db`: Drizzle schema, client and migrations, shared by the API and the worker.
- `packages/shared`: zod schemas and constants shared by every app.

## Commands

- `pnpm install`, then `pnpm typecheck`, `pnpm lint`, `pnpm test`.
- Worker and API tests need Postgres: `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5499/insidejoke_test`.
- One video end to end, no database: `pnpm --filter worker make-video --chat chat.txt --style telenovela --face Dani=dani.jpg --face Ziv=ziv.jpg --out video.mp4`
  (needs `ANTHROPIC_API_KEY` and `FAL_KEY`; asks before the paid fal call).
- Schema change: edit `packages/db/src/schema.ts`, then `pnpm --filter @insidejoke/db db:generate`.
  The API runs migrations on start.

## Rules

- Faces come only from the person's own selfie (camera or their photo library) with a consent
  record in which they confirm it is a photo of them. Never add a way to upload someone else's photo.
- The raw chat text is deleted once the script is approved and is never returned by the API.
- Styles are genres, never named films or shows.
- Name the AI providers in the in-app consent screen before any text or photo leaves the device
  (App Store guideline 5.1.2(i)).
