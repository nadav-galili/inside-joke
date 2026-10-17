import { ApiError, createFalClient } from '@fal-ai/client';
import { VIDEO_SECONDS } from '@insidejoke/shared';

export type VideoRequest = {
  prompt: string;
  referenceImageUrls: string[];
  /** A fal request this job already paid for, to wait on instead of starting a new one. */
  resumeRequestId?: string | null;
  /** Called as soon as fal accepts the request, so a restarted worker can resume it. */
  onSubmitted?: (requestId: string) => Promise<void>;
};
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
/** Longest wait for one take. Past it the fal client cancels the request, so a retry pays again. */
const TAKE_TIMEOUT_MS = 20 * 60_000;
/** fal's price for this endpoint, checked 16 Oct 2026. Used for cost tracking only. */
const USD_PER_SECOND = 0.05;
/**
 * fal keeps generated files on a public URL forever unless told otherwise. The raw take shows the
 * cast's faces, and `finish` downloads it within minutes, so fal deletes it after a day.
 */
const FAL_OUTPUT_LIFETIME = '1d';

export function falVideoGenerator(credentials: string): VideoGenerator {
  const fal = createFalClient({ credentials });
  return async ({ prompt, referenceImageUrls, resumeRequestId, onSubmitted }) => {
    let requestId = resumeRequestId;
    if (!requestId) {
      const queued = await fal.queue.submit(VIDEO_MODEL, {
        input: {
          prompt,
          reference_image_urls: referenceImageUrls,
          duration: VIDEO_SECONDS,
          resolution: '768P',
          aspect_ratio: '9:16',
          prompt_expansion_mode: 'fast',
        },
        storageSettings: { expiresIn: FAL_OUTPUT_LIFETIME },
      });
      requestId = queued.request_id;
      await onSubmitted?.(requestId);
    }
    await fal.queue
      .subscribeToStatus(VIDEO_MODEL, {
        requestId,
        mode: 'polling',
        pollInterval: 5000,
        timeout: TAKE_TIMEOUT_MS,
      })
      .catch((e: unknown) => {
        // The client cancelled the take on timeout: there's nothing left to resume.
        if (e instanceof Error && e.message.startsWith('Client timed out'))
          throw new VideoRequestFailedError(requestId, e.message);
        throw e;
      });
    const result = await fal.queue.result(VIDEO_MODEL, { requestId }).catch((e: unknown) => {
      // A 4xx (other than a timeout or rate limit) is fal saying the take itself failed.
      if (
        e instanceof ApiError &&
        e.status >= 400 &&
        e.status < 500 &&
        ![408, 429].includes(e.status)
      )
        throw new VideoRequestFailedError(requestId, e.message);
      throw e;
    });
    const video = (result.data as { video?: { url?: string } }).video;
    if (!video?.url) throw new VideoRequestFailedError(requestId, 'no video in the result');
    return {
      videoUrl: video.url,
      costUsd: USD_PER_SECOND * VIDEO_SECONDS,
      model: VIDEO_MODEL,
      requestId: result.requestId,
    };
  };
}

/** fal ran the take and it failed. Its request is dropped, so a retry pays for a fresh one. */
export class VideoRequestFailedError extends Error {
  constructor(requestId: string, reason: string) {
    super(`fal ${VIDEO_MODEL} request ${requestId} failed: ${reason}`);
  }
}
