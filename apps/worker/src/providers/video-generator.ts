import { createFalClient } from '@fal-ai/client';
import { VIDEO_SECONDS } from '@insidejoke/shared';

export type VideoRequest = { prompt: string; referenceImageUrls: string[] };
export type GeneratedVideo = {
  videoUrl: string;
  costUsd: number;
  model: string;
  requestId: string;
};
export type VideoGenerator = (request: VideoRequest) => Promise<GeneratedVideo>;

/**
 * MiniMax H3 reference-to-video on fal: one 15s take from the cast's selfies, the route the
 * hand-made poker videos used. 768P is the native mode (2K and 4K only upscale it) and 9:16 suits
 * a phone and a group chat.
 */
export const VIDEO_MODEL = 'minimax/h3/reference-to-video';
/** fal's price for this endpoint, checked 16 Oct 2026. Used for cost tracking only. */
const USD_PER_SECOND = 0.05;

export function falVideoGenerator(credentials: string): VideoGenerator {
  const fal = createFalClient({ credentials });
  return async ({ prompt, referenceImageUrls }) => {
    const result = await fal.subscribe(VIDEO_MODEL, {
      input: {
        prompt,
        reference_image_urls: referenceImageUrls,
        duration: VIDEO_SECONDS,
        resolution: '768P',
        aspect_ratio: '9:16',
        prompt_expansion_mode: 'fast',
      },
    });
    const video = (result.data as { video?: { url?: string } }).video;
    if (!video?.url) throw new Error(`fal ${VIDEO_MODEL} returned no video (${result.requestId})`);
    return {
      videoUrl: video.url,
      costUsd: USD_PER_SECOND * VIDEO_SECONDS,
      model: VIDEO_MODEL,
      requestId: result.requestId,
    };
  };
}
