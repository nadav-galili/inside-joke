import type { Script, VideoStyle } from '@insidejoke/shared';
import { STYLE_DIRECTIONS } from './styles.ts';

/**
 * The video model prompt. Reference images are attached in `script.cast` order, so cast member N
 * is "Image N". The model is told to keep every face from its image and to draw no text, because
 * subtitles are burned in afterwards in the chat's own language.
 */
export function buildVideoPrompt(script: Script, style: VideoStyle): string {
  const cast = script.cast
    .map((c, i) => `${c.role} is the person in Image ${i + 1}. ${c.direction}`.trim())
    .join('\n');
  const beats = script.beats
    .map((b) => {
      const said = b.speakerRole && b.line ? ` ${b.speakerRole} says: "${b.line}"` : '';
      return `${b.fromSecond}-${b.toSecond}s: ${b.action}${said}`;
    })
    .join('\n');
  return [
    STYLE_DIRECTIONS[style],
    `Setting: ${script.setting}`,
    `Characters (keep each face exactly as in its reference image):\n${cast}`,
    `Timeline:\n${beats}`,
    'English dialogue. No subtitles, no captions, no on-screen text.',
  ].join('\n\n');
}
