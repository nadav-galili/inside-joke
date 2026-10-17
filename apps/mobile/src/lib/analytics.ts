import PostHog from 'posthog-react-native';

const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;

/** PostHog when a key is set; without one (local builds) events go nowhere. */
const posthog = key
  ? new PostHog(key, { host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com' })
  : null;

/**
 * The funnel from install to a paid video. Event properties never carry chat text, names or
 * faces.
 */
export type FunnelEvent =
  | 'welcome_finished'
  | 'ai_consent_given'
  | 'selfie_added'
  | 'group_created'
  | 'invite_shared'
  | 'video_started'
  | 'script_regenerated'
  | 'script_approved'
  | 'purchase_started'
  | 'purchase_completed'
  | 'purchase_cancelled'
  | 'video_watched'
  | 'video_shared';

export function track(event: FunnelEvent, properties?: Record<string, string | number | boolean>) {
  posthog?.capture(event, properties);
}

/** Ties events to our user id (never an email) once the API knows the user. */
export function identify(userId: string) {
  posthog?.identify(userId);
}

export function resetAnalytics() {
  posthog?.reset();
}
