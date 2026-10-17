import { faces, generationJobs, members, videoCast, videos, type Db } from '@insidejoke/db';
import type { GenerationStep, Script } from '@insidejoke/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ClaimedJob } from './claim.ts';
import { buildVideoPrompt } from './prompt.ts';
import type { Moderator } from './providers/moderator.ts';
import type { ScriptWriter } from './providers/script-writer.ts';
import type { VideoGenerator } from './providers/video-generator.ts';
import { extractFrames, renderFinal } from './render.ts';
import { videoKey, type Storage } from './storage.ts';

/** What a step reports back: its output, what it cost, and any change to the video row. */
export type StepResult = {
  output: unknown;
  costUsd: number;
  provider?: string;
  model?: string;
  requestId?: string;
  videoUpdate?: { script?: Script; r2Key?: string };
};

export type StepHandler = (job: ClaimedJob) => Promise<StepResult>;

export type StepDeps = {
  writeScript: ScriptWriter;
  generateVideo: VideoGenerator;
  storage: Storage;
  moderate: Moderator;
  render?: typeof renderFinal;
  download?: (url: string, file: string) => Promise<void>;
};

/** The step queued after this one, or null when the video waits on the user or is done. */
export function nextStep(step: GenerationStep): GenerationStep | null {
  switch (step) {
    case 'script':
      // The user approves the script and pays; the API queues `video` after payment.
      return null;
    case 'video':
      return 'finish';
    case 'finish':
      return null;
  }
}

export async function downloadToFile(url: string, file: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

async function loadVideo(db: Db, videoId: string) {
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId));
  if (!video) throw new Error(`video ${videoId} not found`);
  return video;
}

/** The cast in a stable order with each one's active selfie, if they still have one. */
async function loadCast(db: Db, videoId: string) {
  return db
    .select({ memberId: members.id, displayName: members.displayName, faceKey: faces.r2Key })
    .from(videoCast)
    .innerJoin(members, eq(members.id, videoCast.memberId))
    .leftJoin(faces, and(eq(faces.memberId, members.id), isNull(faces.revokedAt)))
    .where(eq(videoCast.videoId, videoId))
    .orderBy(members.id);
}

export function createSteps(db: Db, deps: StepDeps): Record<GenerationStep, StepHandler> {
  const render = deps.render ?? renderFinal;
  const download = deps.download ?? downloadToFile;

  return {
    async script(job) {
      const video = await loadVideo(db, job.videoId);
      if (!video.inputText) throw new Error('video has no chat text to write from');
      const cast = await loadCast(db, job.videoId);
      const written = await deps.writeScript({
        inputText: video.inputText,
        style: video.style,
        cast: cast.map(({ memberId, displayName }) => ({ memberId, displayName })),
      });
      return {
        output: { title: written.script.title },
        costUsd: written.costUsd,
        provider: 'anthropic',
        model: written.model,
        requestId: written.requestId,
        videoUpdate: { script: written.script },
      };
    },

    async video(job) {
      const video = await loadVideo(db, job.videoId);
      if (!video.script) throw new Error('video has no script yet');
      const cast = await loadCast(db, job.videoId);
      const faceKeys = new Map(cast.map((c) => [c.memberId, c.faceKey]));
      // Image N in the prompt is the Nth cast member of the script, so the URLs follow that order.
      const referenceImageUrls = await Promise.all(
        video.script.cast.map(async (c) => {
          const key = faceKeys.get(c.memberId);
          // Consent can be revoked after the script was written; never fall back to an old face.
          if (!key) throw new ConsentWithdrawnError(c.memberId);
          return deps.storage.readUrl(key);
        }),
      );
      const generated = await deps.generateVideo({
        prompt: buildVideoPrompt(video.script, video.style),
        referenceImageUrls,
        // Set when a worker stopped mid-take: the take was paid for, so wait on it instead.
        resumeRequestId: job.requestId,
        onSubmitted: async (requestId) => {
          await db
            .update(generationJobs)
            .set({ requestId, updatedAt: new Date() })
            .where(eq(generationJobs.id, job.id));
        },
      });
      return {
        output: { videoUrl: generated.videoUrl },
        costUsd: generated.costUsd,
        provider: 'fal',
        model: generated.model,
        requestId: generated.requestId,
      };
    },

    async finish(job) {
      const video = await loadVideo(db, job.videoId);
      if (!video.script) throw new Error('video has no script');
      const [raw] = await db
        .select({ output: generationJobs.output })
        .from(generationJobs)
        .where(
          and(
            eq(generationJobs.videoId, job.videoId),
            eq(generationJobs.step, 'video'),
            eq(generationJobs.status, 'done'),
          ),
        )
        .orderBy(desc(generationJobs.updatedAt))
        .limit(1);
      const videoUrl = (raw?.output as { videoUrl?: string } | null)?.videoUrl;
      if (!videoUrl) throw new Error('no generated video to finish');

      const workDir = await mkdtemp(path.join(tmpdir(), 'finish-'));
      try {
        const input = path.join(workDir, 'raw.mp4');
        const output = path.join(workDir, 'final.mp4');
        await download(videoUrl, input);
        await render({
          input,
          output,
          workDir,
          beats: video.script.beats,
          subtitleLanguage: video.script.subtitleLanguage,
          watermark: video.watermarked,
        });
        // Nothing is delivered before it's checked.
        const verdict = await deps.moderate(await extractFrames(output, workDir));
        if (!verdict.safe) throw new ModerationBlockedError(verdict.reason);
        const key = videoKey(video.id);
        await deps.storage.uploadFile(key, output, 'video/mp4');
        return {
          output: { r2Key: key, moderation: verdict.reason },
          costUsd: verdict.costUsd,
          provider: 'anthropic',
          model: verdict.model,
          videoUpdate: { r2Key: key },
        };
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    },
  };
}

/** The finished video failed the moderation check. It is never delivered, and a retry won't help. */
export class ModerationBlockedError extends Error {
  constructor(reason: string) {
    super(`blocked by moderation: ${reason}`);
  }
}

/** A cast member withdrew consent after the script was written. Retrying won't help. */
export class ConsentWithdrawnError extends Error {
  constructor(memberId: string) {
    super(`cast member ${memberId} has no active face; consent was withdrawn`);
  }
}
