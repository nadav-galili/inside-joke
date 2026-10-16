import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Beat } from '@insidejoke/shared';
import { buildAss } from './subtitles.ts';

/** The font for subtitles and the watermark; it must cover Hebrew. Installed in the worker image. */
export const FONT = process.env.SUBTITLE_FONT ?? 'DejaVu Sans';
const WATERMARK_TEXT = 'Made with Inside Joke';

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
 * Burns the subtitles in and, for a free video, a watermark in the top corner. Audio is copied
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
  const filters = [`subtitles=${filterValue(assPath)}`];
  if (opts.watermark) {
    const fontSize = Math.round(size.width * 0.04);
    filters.push(
      `drawtext=font=${filterValue(FONT)}:text=${filterValue(WATERMARK_TEXT)}:fontsize=${fontSize}:fontcolor=white@0.85:borderw=2:bordercolor=black@0.6:x=w-tw-${fontSize}:y=${fontSize}`,
    );
  }
  await run('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-i',
    opts.input,
    '-vf',
    filters.join(','),
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
