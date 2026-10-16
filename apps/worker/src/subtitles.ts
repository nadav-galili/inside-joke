import { isRtlLanguage, type Beat } from '@insidejoke/shared';

/** Lines longer than this are split into two cues so they fit a vertical frame. */
const MAX_CUE_CHARS = 32;

export type Cue = { start: number; end: number; text: string };

/** One or two cues per beat with a subtitle; a long subtitle is split at a word near its middle. */
export function cuesFromBeats(beats: Beat[]): Cue[] {
  const cues: Cue[] = [];
  for (const beat of beats) {
    const text = beat.subtitle.trim().replace(/\s+/g, ' ');
    if (!text) continue;
    if (text.length <= MAX_CUE_CHARS) {
      cues.push({ start: beat.fromSecond, end: beat.toSecond, text });
      continue;
    }
    const words = text.split(' ');
    let first = '';
    while (words.length > 1 && (first + ' ' + words[0]).trim().length <= text.length / 2) {
      first = `${first} ${words.shift()}`.trim();
    }
    if (!first) first = words.shift() ?? '';
    const mid = (beat.fromSecond + beat.toSecond) / 2;
    cues.push({ start: beat.fromSecond, end: mid, text: first });
    cues.push({ start: mid, end: beat.toSecond, text: words.join(' ') });
  }
  return cues;
}

const RLE = '\u202b';
const PDF = '\u202c';
const RLM = '\u200f';

/**
 * Makes a right-to-left line render in the right order: the whole line is embedded RTL, and a line
 * that starts with a digit or Latin letter gets a right-to-left mark first, or libass would lay the
 * opening number out on the wrong side.
 */
export function rtlLine(text: string): string {
  const lead = /^[0-9A-Za-z]/.test(text) ? RLM : '';
  return `${RLE}${lead}${text}${PDF}`;
}

function assTime(seconds: number): string {
  const cs = Math.round(seconds * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

/** ASS braces and backslashes are override codes; subtitles are plain text. */
function escapeAss(text: string): string {
  return text.replace(/[{}]/g, '').replace(/\\/g, '');
}

/**
 * An ASS file for the burned-in subtitles: bold white with a thick outline, bottom centre, sized
 * for the frame (the house style of the hand-made videos).
 */
export function buildAss(
  beats: Beat[],
  lang: string,
  size: { width: number; height: number },
  font: string,
): string {
  const rtl = isRtlLanguage(lang);
  const vertical = size.height > size.width;
  const fontSize = Math.round(size.width * (vertical ? 0.065 : 0.036));
  const marginV = Math.round(size.height * (vertical ? 0.17 : 0.06));
  const encoding = rtl ? 177 : 1;
  const events = cuesFromBeats(beats).map((cue) => {
    const text = escapeAss(cue.text);
    return `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Default,,0,0,0,,${rtl ? rtlLine(text) : text}`;
  });
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${size.width}`,
    `PlayResY: ${size.height}`,
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${font},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(fontSize / 13))},2,2,${Math.round(size.width * 0.06)},${Math.round(size.width * 0.06)},${marginV},${encoding}`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    '',
  ].join('\n');
}
