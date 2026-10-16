/**
 * Makes one video end to end from the command line, without the database or R2:
 *
 *   pnpm --filter worker make-video --chat chat.txt --style telenovela \
 *     --face Dani=dani.jpg --face Ziv=ziv.jpg --out video.mp4
 *
 * Needs ANTHROPIC_API_KEY and FAL_KEY. It prints the script and asks before the paid video call
 * unless --yes is passed.
 */
import { createFalClient } from '@fal-ai/client';
import { VIDEO_SECONDS, videoStyleSchema } from '@insidejoke/shared';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { buildVideoPrompt } from './prompt.ts';
import { claudeScriptWriter } from './providers/script-writer.ts';
import { falVideoGenerator } from './providers/video-generator.ts';
import { renderFinal } from './render.ts';
import { downloadToFile } from './steps.ts';

const { values } = parseArgs({
  options: {
    chat: { type: 'string' },
    style: { type: 'string', default: 'action_trailer_80s' },
    face: { type: 'string', multiple: true, default: [] },
    out: { type: 'string', default: 'video.mp4' },
    watermark: { type: 'boolean', default: false },
    yes: { type: 'boolean', default: false },
  },
});

const falKey = process.env.FAL_KEY;
if (!falKey || !process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY and FAL_KEY are required');
}
if (!values.chat) throw new Error('--chat <file> is required');
const style = videoStyleSchema.parse(values.style);
const faces = values.face.map((f) => {
  const [name, file] = f.split('=');
  if (!name || !file) throw new Error(`--face must be Name=path, got "${f}"`);
  return { memberId: crypto.randomUUID(), displayName: name, file };
});

const inputText = await readFile(values.chat, 'utf8');
console.log(`Writing the script for ${faces.map((f) => f.displayName).join(', ')}...`);
const { script, costUsd: scriptCost } = await claudeScriptWriter()({
  inputText,
  style,
  cast: faces.map(({ memberId, displayName }) => ({ memberId, displayName })),
});
console.log(JSON.stringify(script, null, 2));

const videoCost = 0.05 * VIDEO_SECONDS;
if (!values.yes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `Generate the video on fal for about $${videoCost.toFixed(2)}? [y/N] `,
  );
  rl.close();
  if (answer.trim().toLowerCase() !== 'y') process.exit(0);
}

const fal = createFalClient({ credentials: falKey });
const byId = new Map<string, (typeof faces)[number]>(faces.map((f) => [f.memberId, f]));
const referenceImageUrls = await Promise.all(
  script.cast.map(async (c) => {
    const face = byId.get(c.memberId)!;
    return fal.storage.upload(new Blob([await readFile(face.file)]));
  }),
);
console.log('Generating the video (this takes a few minutes)...');
const generated = await falVideoGenerator(falKey)({
  prompt: buildVideoPrompt(script, style),
  referenceImageUrls,
});

const workDir = await mkdtemp(path.join(tmpdir(), 'make-video-'));
try {
  const raw = path.join(workDir, 'raw.mp4');
  await downloadToFile(generated.videoUrl, raw);
  await renderFinal({
    input: raw,
    output: path.resolve(values.out),
    workDir,
    beats: script.beats,
    subtitleLanguage: script.subtitleLanguage,
    watermark: values.watermark,
  });
} finally {
  await rm(workDir, { recursive: true, force: true });
}
console.log(
  `Saved ${values.out}. Cost about $${(scriptCost + generated.costUsd).toFixed(2)} (fal request ${generated.requestId}).`,
);
