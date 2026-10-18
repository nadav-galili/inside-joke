// Pre-commit check: blocks staged files over 5,000 tokens (tokens = bytes / 4).
// Only the staged version of each added or changed file is measured, so a file
// that is already too big is not blocked until someone edits it.
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const MAX_TOKENS = 5000;
const BYTES_PER_TOKEN = 4;

// Files no agent writes by hand: lockfiles, codegen and exported assets.
const IGNORED = [
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|Podfile\.lock|Gemfile\.lock|Cargo\.lock)$/,
  /^packages\/db\/drizzle\//, // drizzle-kit migrations and snapshots
  /(^|\/)expo-env\.d\.ts$/,
  /\.(min\.js|min\.css|map|snap|svg)$/,
];

// A file that says it is generated in its first lines is codegen too.
const GENERATED_MARKER = /@generated|\bauto-?generated\b/i;

const git = (...args) => execFileSync('git', args, { maxBuffer: 256 * 1024 * 1024 });

const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z')
  .toString()
  .split('\0')
  .filter(Boolean);

const oversized = [];
for (const file of staged) {
  if (IGNORED.some((pattern) => pattern.test(file))) continue;
  const blob = git('cat-file', 'blob', `:${file}`);
  // Same heuristic as git: a NUL byte near the start means binary (images, video, fonts).
  if (blob.subarray(0, 8000).includes(0)) continue;
  if (GENERATED_MARKER.test(blob.subarray(0, 500).toString())) continue;
  const tokens = Math.ceil(blob.length / BYTES_PER_TOKEN);
  if (tokens > MAX_TOKENS) oversized.push({ file, tokens });
}

if (oversized.length > 0) {
  const list = oversized.map(({ file, tokens }) => `  ${file}  ~${tokens} tokens`).join('\n');
  process.stderr.write(`
Commit blocked: ${oversized.length === 1 ? 'this file is' : 'these files are'} over ${MAX_TOKENS.toLocaleString('en-US')} tokens (bytes / ${BYTES_PER_TOKEN}, so about ${(MAX_TOKENS * BYTES_PER_TOKEN) / 1000} KB):

${list}

Split each file into smaller modules, then stage the result and commit again:

  1. Find the seams. Look for groups of code that change together: one React
     component and its styles, one route or handler, one worker step, one set
     of helpers, one block of constants or types.
  2. Move each group into its own file next to the original, named for what it
     does (for example a routes.ts with three route groups becomes
     routes/videos.ts, routes/groups.ts and routes/me.ts).
     Move code as is; do not rewrite it while moving.
  3. Export what moved and import it from the original file. Keep the original
     file's exports the same so callers do not change. Under apps/mobile/src/app
     every file is a route in expo-router, so put extracted pieces in
     apps/mobile/src/components (or a folder outside app/), not beside the route.
  4. Split tests the same way: one test file per module or per describe block,
     with shared setup moved into a helper file.
  5. Run pnpm typecheck, pnpm lint and pnpm test, then git add the new files
     and the shrunken original, and commit.

Aim for each file to stay well under the limit so the next edit does not trip it.
Lockfiles, drizzle migrations, binaries and files marked @generated are skipped.
`);
  process.exit(1);
}
