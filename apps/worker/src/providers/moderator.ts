import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { Script } from '@insidejoke/shared';
import { readFile } from 'node:fs/promises';
import { z } from 'zod/v4';

export type ModerationResult = { safe: boolean; reason: string; costUsd: number; model: string };
/** Checks frames of a finished video before anyone sees it. */
export type Moderator = (framePaths: string[]) => Promise<ModerationResult>;
/**
 * Checks the approved script's words before anything is filmed. The user can rewrite every line,
 * and the lines are spoken aloud, which the frame check can't hear.
 */
export type ScriptModerator = (script: Script) => Promise<ModerationResult>;

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
    return review(client, SYSTEM, [
      ...images,
      { type: 'text', text: 'Is this video safe to deliver?' },
    ]);
  };
}

/** Asks Claude for a verdict. A refusal to review is a block: nothing unreviewed goes out. */
async function review(
  client: Anthropic,
  system: string,
  content: Anthropic.ContentBlockParam[],
): Promise<ModerationResult> {
  const response = await client.messages.parse({
    model: MODERATION_MODEL,
    max_tokens: 1000,
    output_config: { format: zodOutputFormat(verdictSchema) },
    system,
    messages: [{ role: 'user', content }],
  });
  const costUsd =
    response.usage.input_tokens * INPUT_USD_PER_TOKEN +
    response.usage.output_tokens * OUTPUT_USD_PER_TOKEN;
  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    return { safe: false, reason: 'the review was refused', costUsd, model: MODERATION_MODEL };
  }
  return { ...response.parsed_output, costUsd, model: MODERATION_MODEL };
}

const SCRIPT_SYSTEM = `You review the script of a short AI-generated comedy video before it is filmed. The cast are adult friends who each added their own selfie and agreed to appear; the person ordering it may have rewritten any line.

Mark it unsafe if any spoken line, subtitle or action contains: sexual content; anything involving a child; threats, or violence meant seriously against a cast member; slurs or hate against a group; a claim that a cast member committed a real crime or has a medical condition, written as if true; or private details such as a phone number, address or password.
Teasing, roasting, slapstick, swearing between friends and obvious exaggeration are fine.
Give a one-sentence reason either way.`;

/** The words of a script, as the reviewer reads them. */
function scriptText(script: Script): string {
  const beats = script.beats.map(
    (b) =>
      `[${b.fromSecond}-${b.toSecond}s] ACTION: ${b.action}\nLINE (${b.speakerRole ?? 'narrator'}): ${b.line}\nSUBTITLE: ${b.subtitle}`,
  );
  return [`TITLE: ${script.title}`, `SETTING: ${script.setting}`, ...beats].join('\n\n');
}

export function claudeScriptModerator(client = new Anthropic()): ScriptModerator {
  return (script) =>
    review(client, SCRIPT_SYSTEM, [
      {
        type: 'text',
        text: `<script>\n${scriptText(script)}\n</script>\n\nIs this script safe to film?`,
      },
    ]);
}
