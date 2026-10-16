import { z } from 'zod';

/** Genre styles only: named films and shows are out for copyright reasons (build plan, safety). */
export const VIDEO_STYLES = [
  'action_trailer_80s',
  'nature_documentary',
  'telenovela',
  'sports_commentary',
] as const;
export const videoStyleSchema = z.enum(VIDEO_STYLES);
export type VideoStyle = z.infer<typeof videoStyleSchema>;

/** A video moves forward through these; `failed` and `deleted` are terminal. */
export const VIDEO_STATUSES = [
  'draft',
  'script_ready',
  'paid',
  'generating',
  'ready',
  'failed',
  'deleted',
] as const;
export const videoStatusSchema = z.enum(VIDEO_STATUSES);
export type VideoStatus = z.infer<typeof videoStatusSchema>;

/** v1 makes 15-second videos only. */
export const VIDEO_SECONDS = 15;
export const MIN_CAST = 2;
export const MAX_CAST = 4;
/** Raw chat text is capped so one request can't send a whole export to the LLM. */
export const MAX_INPUT_CHARS = 4000;

export const createVideoSchema = z.object({
  groupId: z.string().uuid(),
  inputText: z.string().trim().min(1).max(MAX_INPUT_CHARS),
  style: videoStyleSchema,
  castMemberIds: z.array(z.string().uuid()).min(MIN_CAST).max(MAX_CAST),
});
export type CreateVideo = z.infer<typeof createVideoSchema>;

/** One beat of the 15-second timeline. */
export const beatSchema = z.object({
  fromSecond: z.number().int().min(0),
  toSecond: z.number().int().positive(),
  /** What happens on screen, in English, naming cast by their `role`. */
  action: z.string().min(1),
  /** The `role` of whoever speaks, or null when nobody does. */
  speakerRole: z.string().nullable(),
  /** The spoken line, in English (video models voice English best). Empty when nobody speaks. */
  line: z.string(),
  /** The subtitle burned in for this beat, in the chat's own language. Empty for none. */
  subtitle: z.string(),
});
export type Beat = z.infer<typeof beatSchema>;

export const castRoleSchema = z.object({
  memberId: z.string().uuid(),
  /** A short screen name used in the prompt, e.g. "THE ACCOUNTANT". */
  role: z.string().min(1),
  /** One line on how they look and act in this scene; never their appearance, which comes from the selfie. */
  direction: z.string(),
});
export type CastRole = z.infer<typeof castRoleSchema>;

export const scriptSchema = z.object({
  title: z.string().min(1),
  /** The chat moment the joke is built on, in one sentence, in the chat's language. */
  premise: z.string().min(1),
  /** Setting, look and camera style in English. */
  setting: z.string().min(1),
  cast: z.array(castRoleSchema).min(MIN_CAST).max(MAX_CAST),
  beats: z.array(beatSchema).min(2).max(6),
  /** BCP-47 language of the subtitles, e.g. "he" or "en". */
  subtitleLanguage: z.string().min(2),
});
export type Script = z.infer<typeof scriptSchema>;

/**
 * The steps the worker runs for one video, in order. `script` runs before payment; `video` and
 * `finish` run once the user has approved the script and paid.
 */
export const GENERATION_STEPS = ['script', 'video', 'finish'] as const;
export const generationStepSchema = z.enum(GENERATION_STEPS);
export type GenerationStep = z.infer<typeof generationStepSchema>;

/** Right-to-left scripts whose subtitles need bidi handling. */
const RTL_LANGUAGES = new Set(['he', 'ar', 'fa', 'ur', 'yi']);
export function isRtlLanguage(lang: string): boolean {
  return RTL_LANGUAGES.has(lang.toLowerCase().split('-')[0] ?? '');
}
