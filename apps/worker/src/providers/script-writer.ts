import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  MAX_CAST,
  MIN_CAST,
  scriptSchema,
  VIDEO_SECONDS,
  type Script,
  type VideoStyle,
} from '@insidejoke/shared';
import { z } from 'zod/v4';
import { STYLE_DIRECTIONS } from '../styles.ts';

export type ScriptInput = {
  inputText: string;
  style: VideoStyle;
  cast: { memberId: string; displayName: string }[];
};

export type WrittenScript = { script: Script; costUsd: number; model: string; requestId: string };
export type ScriptWriter = (input: ScriptInput) => Promise<WrittenScript>;

export const SCRIPT_MODEL = 'claude-opus-5-5';
/** Claude Opus 5.5 list prices per token (USD), for cost tracking only. */
const INPUT_USD_PER_TOKEN = 4 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 20 / 1_000_000;

/** The structured-output schema: the same shape as the shared script, in zod v4 for the SDK. */
const outputSchema = z.object({
  title: z.string(),
  premise: z.string(),
  setting: z.string(),
  cast: z.array(z.object({ memberId: z.string(), role: z.string(), direction: z.string() })),
  beats: z.array(
    z.object({
      fromSecond: z.number().int(),
      toSecond: z.number().int(),
      action: z.string(),
      speakerRole: z.string().nullable(),
      line: z.string(),
      subtitle: z.string(),
    }),
  ),
  subtitleLanguage: z.string(),
});

const SYSTEM = `You write ${VIDEO_SECONDS}-second comedy scenes that star a real group of friends, built from a moment in their group chat.

Rules:
- Find the single funniest moment or running joke in the chat text and build the scene around it. Keep it affectionate: tease, never humiliate.
- People pay for this video to laugh, so a faithful retelling of the moment is not enough. Build it like a sketch: set up the situation, escalate it with a bigger and more absurd gag in each beat, and end on a punchline. Exaggerate physically and visually; the video model shows actions far better than it shows subtle wit.
- The last beat is the payoff. Land it on the butt of the joke with a clear, readable reaction (crushed, outraged, defeated) and a short closing line.
- Every prop, habit and detail must serve the joke. Leave out anything that doesn't, even if it appears in the chat.
- Use only the cast you are given, ${MIN_CAST} to ${MAX_CAST} people, each exactly once in "cast" with the memberId you were given. Give each a short screen role in capitals.
- Never describe anyone's face, body, age, skin or hair: their look comes from their own selfie.
- The genre is a style only. Never name or imitate a real film, show, actor or character.
- No sexual content, no minors, no violence against real people, no politics, no religion, no slurs.
- Write 3 or 4 beats covering 0 to ${VIDEO_SECONDS} seconds with no gaps or overlaps.
- "action" and "line" are in English. Lines are short and punchy (at most 12 words) and reuse the chat's real wording when it is funny.
- "subtitle" is the same line in the chat's language, using the chat's original words where possible. Set "subtitleLanguage" to that language's code.
- "premise" says, in the chat's language, which chat moment the scene is based on.`;

export function claudeScriptWriter(client = new Anthropic()): ScriptWriter {
  return async ({ inputText, style, cast }) => {
    const castList = cast.map((m) => `- memberId ${m.memberId}: ${m.displayName}`).join('\n');
    const response = await client.messages.parse({
      model: SCRIPT_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium', format: zodOutputFormat(outputSchema) },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Style: ${STYLE_DIRECTIONS[style]}\n\nCast:\n${castList}\n\nGroup chat:\n<chat>\n${inputText}\n</chat>`,
        },
      ],
    });
    if (response.stop_reason === 'refusal') {
      throw new ScriptRefusedError(response.stop_details?.explanation ?? 'refused');
    }
    const script = checkScript(response.parsed_output, cast);
    const costUsd =
      response.usage.input_tokens * INPUT_USD_PER_TOKEN +
      response.usage.output_tokens * OUTPUT_USD_PER_TOKEN;
    return { script, costUsd, model: SCRIPT_MODEL, requestId: response.id };
  };
}

/** The writer declined the chat text; retrying the same input won't help. */
export class ScriptRefusedError extends Error {}

/** Validates the model's output and checks it cast exactly the people it was given. */
export function checkScript(output: unknown, cast: ScriptInput['cast']): Script {
  const script = scriptSchema.parse(output);
  const given = new Set(cast.map((m) => m.memberId));
  const used = new Set(script.cast.map((c) => c.memberId));
  if (
    used.size !== script.cast.length ||
    used.size !== given.size ||
    [...used].some((id) => !given.has(id))
  ) {
    throw new Error('script cast does not match the requested cast');
  }
  const roles = new Set(script.cast.map((c) => c.role));
  let second = 0;
  for (const beat of script.beats) {
    if (beat.fromSecond !== second || beat.toSecond <= beat.fromSecond) {
      throw new Error(`script beats must cover 0-${VIDEO_SECONDS}s without gaps`);
    }
    if (beat.speakerRole !== null && !roles.has(beat.speakerRole)) {
      throw new Error(`beat speaker "${beat.speakerRole}" is not in the cast`);
    }
    second = beat.toSecond;
  }
  if (second !== VIDEO_SECONDS) throw new Error(`script beats must end at ${VIDEO_SECONDS}s`);
  return script;
}
