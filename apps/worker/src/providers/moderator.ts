import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { readFile } from 'node:fs/promises';
import { z } from 'zod/v4';

export type ModerationResult = { safe: boolean; reason: string; costUsd: number; model: string };
/** Checks frames of a finished video before anyone sees it. */
export type Moderator = (framePaths: string[]) => Promise<ModerationResult>;

export const MODERATION_MODEL = 'claude-haiku-5-5';
/** Claude Haiku 5.5 list prices per token (USD), for cost tracking only. */
const INPUT_USD_PER_TOKEN = 1 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 5 / 1_000_000;

const verdictSchema = z.object({ safe: z.boolean(), reason: z.string() });

const SYSTEM = `You review frames from a short AI-generated comedy video before it is delivered to the person who ordered it. The people in it are adult friends who consented to appear.

Mark it unsafe if any frame shows: nudity or sexual content; anyone who looks like a child; graphic violence, blood or gore; weapons aimed at a person; hate symbols; a real politician or celebrity; or text that is a slur.
Slapstick, silly faces, mild cartoon peril, card games, drinks and food are fine.
Give a one-sentence reason either way.`;

export function claudeModerator(client = new Anthropic()): Moderator {
  return async (framePaths) => {
    const images = await Promise.all(
      framePaths.map(async (p) => ({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: 'image/jpeg' as const,
          data: (await readFile(p)).toString('base64'),
        },
      })),
    );
    const response = await client.messages.parse({
      model: MODERATION_MODEL,
      max_tokens: 1000,
      output_config: { format: zodOutputFormat(verdictSchema) },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [...images, { type: 'text', text: 'Is this video safe to deliver?' }],
        },
      ],
    });
    const costUsd =
      response.usage.input_tokens * INPUT_USD_PER_TOKEN +
      response.usage.output_tokens * OUTPUT_USD_PER_TOKEN;
    // A refusal to review is treated as a block: nothing unreviewed is delivered.
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return { safe: false, reason: 'the review was refused', costUsd, model: MODERATION_MODEL };
    }
    return { ...response.parsed_output, costUsd, model: MODERATION_MODEL };
  };
}
