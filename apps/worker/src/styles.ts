import type { VideoStyle } from '@insidejoke/shared';

/**
 * How each style looks and sounds. Genres only: no named film, show or character, so neither the
 * script nor the video copies anyone's work or likeness (AGENTS.md).
 */
export const STYLE_DIRECTIONS: Record<VideoStyle, string> = {
  action_trailer_80s:
    'An over-the-top 1980s action movie trailer: grainy film look, slow-motion explosions, lens flares, dramatic low angles, a gravel-voiced trailer narrator.',
  nature_documentary:
    'A hushed wildlife documentary: the friends observed like animals in their habitat, long-lens shots, a calm, whispering narrator.',
  telenovela:
    'A melodramatic telenovela: harsh zooms, gasps, dramatic music stings, intense eye contact, glossy soap-opera lighting.',
  sports_commentary:
    'A live sports broadcast: replays, on-field camera angles, two excited commentators calling the action as if it were a final.',
};
