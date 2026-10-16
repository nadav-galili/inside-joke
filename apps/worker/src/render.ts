import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Beat } from '@insidejoke/shared';
import { buildAss } from './subtitles.ts';

/** The font for subtitles and the watermark; it must cover Hebrew. Installed in the worker image. */
export const FONT = process.env.SUBTITLE_FONT ?? 'DejaVu Sans';
/** The free-video watermark: the app's marquee-bubble mark with the name beside it, in the brand face. */
const ASSETS = path.resolve(import.meta.dirname, '../assets');
const WATERMARK_MARK = path.join(ASSETS, 'watermark.png');
const WATERMARK_FONT = path.join(ASSETS, 'BricolageGrotesque_800ExtraBold.ttf');
const WATERMARK_TEXT = 'Inside Joke';
/** Width over height of watermark.png. */
const MARK_ASPECT = 256 / 243;
/** Every video says it's AI-made, paid or not (build plan, safety). */
const AI_LABEL = 'AI-generated';

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-2000)}`)),
    );
  });
}

export async function videoSize(file: string): Promise<{ width: number; height: number }> {
  const out = await run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0',
    file,
  ]);
  const [width, height] = out.trim().split(',').map(Number);
  if (!width || !height) throw new Error(`could not read the size of ${file}`);
  return { width, height };
}

/** Escapes a value for an ffmpeg filter argument: quotes, colons and backslashes are syntax. */
function filterValue(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "'\\''").replace(/:/g, '\\:')}'`;
}

/**
 * Burns the subtitles and the AI label in and, for a free video, the watermark in the top right corner. Audio is copied
 * untouched; the output starts playing before it has fully downloaded (`+faststart`).
 */
export async function renderFinal(opts: {
  input: string;
  output: string;
  workDir: string;
  beats: Beat[];
  subtitleLanguage: string;
  watermark: boolean;
}): Promise<void> {
  const size = await videoSize(opts.input);
  const assPath = path.join(opts.workDir, 'subtitles.ass');
  await writeFile(assPath, buildAss(opts.beats, opts.subtitleLanguage, size, FONT));
  const labelSize = Math.round(size.width * 0.03);
  const base = [
    `subtitles=${filterValue(assPath)}`,
    `drawtext=font=${filterValue(FONT)}:text=${filterValue(AI_LABEL)}:fontsize=${labelSize}:fontcolor=white@0.8:borderw=2:bordercolor=black@0.6:x=${labelSize}:y=${labelSize}`,
  ].join(',');
  let graph = `[0:v]${base}[out]`;
  const inputs = ['-i', opts.input];
  if (opts.watermark) {
    const markH = Math.round(size.width * 0.1);
    const markW = Math.round(markH * MARK_ASPECT);
    const margin = Math.round(size.width * 0.035);
    const fontSize = Math.round(markH * 0.42);
    const textX = `w-tw-${margin + markW + Math.round(markH * 0.18)}`;
    const textY = `${margin}+(${markH}-th)/2`;
    inputs.push('-i', WATERMARK_MARK);
    graph = [
      `[0:v]${base}[base]`,
      `[1:v]scale=${markW}:${markH},format=rgba,colorchannelmixer=aa=0.92[mark]`,
      `[base][mark]overlay=x=W-w-${margin}:y=${margin},` +
        `drawtext=fontfile=${filterValue(WATERMARK_FONT)}:text=${filterValue(WATERMARK_TEXT)}:fontsize=${fontSize}:fontcolor=0xFFF3E2@0.95:shadowcolor=black@0.55:shadowx=2:shadowy=2:x=${textX}:y=${textY}[out]`,
    ].join(';');
  }
  await run('ffmpeg', [
    '-y',
    '-v',
    'error',
    ...inputs,
    '-filter_complex',
    graph,
    '-map',
    '[out]',
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-crf',
    '20',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'copy',
    '-movflags',
    '+faststart',
    opts.output,
  ]);
}

/** Saves `count` evenly spaced frames of a video as small JPEGs, for the moderation check. */
export async function extractFrames(file: string, workDir: string, count = 4): Promise<string[]> {
  const out = await run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    file,
  ]);
  const duration = Number(out.trim());
  if (!duration) throw new Error(`could not read the duration of ${file}`);
  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    const at = (duration * (i + 0.5)) / count;
    const frame = path.join(workDir, `frame-${i}.jpg`);
    await run('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-ss',
      at.toFixed(2),
      '-i',
      file,
      '-frames:v',
      '1',
      '-vf',
      'scale=-2:512',
      frame,
    ]);
    frames.push(frame);
  }
  return frames;
}
