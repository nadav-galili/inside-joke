import type { VideoStatus, VideoStyle } from '@insidejoke/shared';

/** How each genre is offered in the app. Genres only, never a named film or show. */
export const STYLE_LABELS: Record<VideoStyle, { label: string; emoji: string }> = {
  action_trailer_80s: { label: '80s action trailer', emoji: '💥' },
  nature_documentary: { label: 'Nature documentary', emoji: '🦁' },
  telenovela: { label: 'Telenovela', emoji: '🌹' },
  sports_commentary: { label: 'Sports commentary', emoji: '🎙️' },
};

export const STATUS_LABELS: Record<VideoStatus, string> = {
  draft: 'Writing the script…',
  script_ready: 'Script ready to approve',
  paid: 'Making your video…',
  generating: 'Adding the finishing touches…',
  ready: 'Ready to watch',
  failed: "Couldn't be made",
  deleted: 'Deleted',
};

/** Statuses the server is still working through, so the app polls. */
export const isInProgress = (s: VideoStatus) => s === 'draft' || s === 'paid' || s === 'generating';
