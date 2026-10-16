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

/** One shot of the script: who is in it, what happens, and the line spoken. */
export const shotSchema = z.object({
  castMemberIds: z.array(z.string().uuid()).min(1),
  action: z.string().min(1),
  line: z.string(),
  seconds: z.number().positive(),
});
export const scriptSchema = z.object({
  title: z.string().min(1),
  shots: z.array(shotSchema).min(1).max(6),
});
export type Script = z.infer<typeof scriptSchema>;

/** The steps the worker runs for one video, in order. */
export const GENERATION_STEPS = ['script', 'keyframes', 'clips', 'stitch'] as const;
export const generationStepSchema = z.enum(GENERATION_STEPS);
export type GenerationStep = z.infer<typeof generationStepSchema>;
