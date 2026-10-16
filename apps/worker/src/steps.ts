import type { GenerationStep } from '@insidejoke/shared';
import type { ClaimedJob } from './claim.ts';

/** What a step reports back: its output for the next step and what it cost. */
export type StepResult = {
  output: unknown;
  costUsd: number;
  provider?: string;
  model?: string;
  requestId?: string;
};

export type StepHandler = (job: ClaimedJob) => Promise<StepResult>;

/** Thrown by a step whose implementation hasn't landed yet, so the job fails loudly. */
export class StepNotImplementedError extends Error {
  constructor(step: GenerationStep) {
    super(`step "${step}" is not implemented yet (build plan phase 1)`);
  }
}

const notYet =
  (step: GenerationStep): StepHandler =>
  async () => {
    throw new StepNotImplementedError(step);
  };

/**
 * script: chat text to script and shot list (LLM)
 * keyframes: one image per shot with the cast's faces (fal)
 * clips: one video clip per keyframe (fal)
 * stitch: clips, subtitles and watermark into the final mp4 (ffmpeg), saved to R2
 */
export const steps: Record<GenerationStep, StepHandler> = {
  script: notYet('script'),
  keyframes: notYet('keyframes'),
  clips: notYet('clips'),
  stitch: notYet('stitch'),
};

/** The step queued after this one, or null when the video waits on the user or is done. */
export function nextStep(step: GenerationStep): GenerationStep | null {
  switch (step) {
    case 'script':
      // The user approves the script and pays; the API queues keyframes after payment.
      return null;
    case 'keyframes':
      return 'clips';
    case 'clips':
      return 'stitch';
    case 'stitch':
      return null;
  }
}
