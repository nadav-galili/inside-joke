import PostHog from 'posthog-react-native';

const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;

/**
 * PostHog when a key is set; without one (local builds) events go nowhere. Nothing is sent until
 * the user opts in (GDPR, guideline 5.1.1(ii)); PostHog remembers the choice on the device.
 */
const posthog = key
  ? new PostHog(key, {
      host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      defaultOptIn: false,
      // Opting out only stops events. Flags would still send the user's ids on launch, sign-in and
      // sign-out, and the app uses none.
      disableRemoteFeatureFlags: true,
      preloadFeatureFlags: false,
    })
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

/** Whether usage stats are being shared. */
export function analyticsEnabled(): boolean {
  return posthog ? !posthog.optedOut : false;
}

/** Turns usage stats on or off; off can be chosen at any time in Settings. */
export async function setAnalyticsEnabled(enabled: boolean) {
  if (enabled) await posthog?.optIn();
  else await posthog?.optOut();
}

/** Forgets the user on sign-out, which also turns usage stats off until they opt in again. */
export function resetAnalytics() {
  posthog?.reset();
  void posthog?.optOut();
}
