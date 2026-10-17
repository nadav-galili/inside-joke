import { z } from 'zod';
import { scriptSchema, type Script, type VideoStatus, type VideoStyle } from './video.ts';

/**
 * The services a user's data goes to, named on the consent screen before anything leaves the
 * device (App Store guideline 5.1.2(i)). `credit` is the short role shown above the name in the app.
 * Change the version whenever the `receives` text changes.
 */
export const AI_PROVIDERS = [
  {
    name: 'Anthropic (Claude)',
    credit: 'Writes and checks',
    receives:
      'the chat text you paste, to write the script and check it before filming, and a few frames of the finished video, to check it is safe before delivery',
  },
  {
    name: 'fal (MiniMax video model)',
    credit: 'Films',
    receives: 'the selfies of the cast and the written scene, to make the video',
  },
] as const;
export const AI_CONSENT_VERSION = 'ai-v3';

/** What someone agrees to when they add their own selfie. Stored with every face. */
export const FACE_CONSENT_VERSION = 'face-v2';
export const FACE_CONSENT_TEXT =
  "This is a photo of me, taken by me. I agree that my group's members can put my face in " +
  'AI-generated comedy videos made with Inside Joke, that my photo is sent to fal to make them, ' +
  'and that frames of those videos are sent to Anthropic for a safety check. I can remove my face at any time, and nobody can then use it in a new video.';

/** The App Store consumable for one video, sold through RevenueCat. */
export const VIDEO_PRODUCT_ID = 'video_15s';

export const MAX_GROUP_NAME = 60;
export const MAX_DISPLAY_NAME = 40;
/** How many times a user can ask for a fresh script for one video. */
export const MAX_SCRIPT_ATTEMPTS = 3;

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(MAX_GROUP_NAME),
  /** What the group calls the creator; the script writer uses it to cast them. */
  myName: z.string().trim().min(1).max(MAX_DISPLAY_NAME),
});

export const recordSelfieSchema = z.object({
  key: z.string().min(1),
  consentTextVersion: z.literal(FACE_CONSENT_VERSION),
});

/** A friend joining from the invite page with their own selfie. */
export const joinGroupSchema = z.object({
  displayName: z.string().trim().min(1).max(MAX_DISPLAY_NAME),
  key: z.string().min(1),
  consentTextVersion: z.literal(FACE_CONSENT_VERSION),
  aiConsentVersion: z.literal(AI_CONSENT_VERSION),
  /** The app is 18+; friends confirm it on the invite page. */
  adult: z.literal(true),
});

/** AI data consent, given with the 18+ age confirmation on the same screen. */
export const aiConsentSchema = z.object({
  version: z.literal(AI_CONSENT_VERSION),
  adult: z.literal(true),
});
/** Why someone reports a finished video (guideline 1.2). */
export const REPORT_REASONS = {
  offensive: 'Offensive or harmful',
  no_consent: "Someone in it didn't agree to be in it",
  other: 'Something else',
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;
export const reportVideoSchema = z.object({
  reason: z.enum(Object.keys(REPORT_REASONS) as [ReportReason]),
});

export const pushTokenSchema = z.object({ token: z.string().min(1).max(200) });
export const updateScriptSchema = z.object({ script: scriptSchema });

export type UploadTarget = { key: string; uploadUrl: string };

export type Me = {
  id: string;
  aiConsented: boolean;
  hasSelfie: boolean;
  selfieUrl: string | null;
  freeVideoUsed: boolean;
  videoCredits: number;
};

export type GroupSummary = { id: string; name: string; memberCount: number; inviteUrl: string };

export type MemberView = {
  id: string;
  displayName: string;
  /** Has an active, consented selfie, so can be cast. */
  hasFace: boolean;
  isMe: boolean;
};

export type GroupDetail = GroupSummary & { members: MemberView[] };

export type VideoSummary = {
  id: string;
  groupId: string;
  status: VideoStatus;
  style: VideoStyle;
  title: string | null;
  createdAt: string;
};

export type VideoDetail = VideoSummary & {
  script: Script | null;
  cast: { memberId: string; displayName: string }[];
  watermarked: boolean;
  /** A short-lived link to the finished video, once it is ready. */
  playUrl: string | null;
  /** Whether a fresh script can still be asked for. */
  canRegenerate: boolean;
};

/** What approving the script costs the user: their free video, a credit, or a purchase. */
export type ApproveResult =
  { status: 'paid'; paidWith: 'free' | 'credit' } | { error: 'payment_required' };
