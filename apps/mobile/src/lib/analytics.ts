import PostHog from 'posthog-react-native';

const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;

/**
 * PostHog when a key is set; without one (local builds) events go nowhere. Usage stats are on
 * until the user turns them off on the consent screen or in Settings; PostHog remembers the
 * choice on the device.
 */
const posthog = key
  ? new PostHog(key, {
      host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      defaultOptIn: true,
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
  | 'trailer_opened'
  | 'ai_consent_given'
  | 'selfie_added'
  | 'group_created'
  | 'invite_shared'
  | 'video_started'
  | 'script_viewed'
  | 'script_regenerated'
  | 'paywall_viewed'
  | 'script_approved'
  | 'purchase_started'
  | 'purchase_completed'
  | 'purchase_pending'
  | 'purchase_cancelled'
  | 'purchase_failed'
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

/** Turns usage stats on or off, from the consent screen or at any time in Settings. */
export async function setAnalyticsEnabled(enabled: boolean) {
  if (enabled) await posthog?.optIn();
  else await posthog?.optOut();
}

/** Forgets the user on sign-out. The device keeps its on or off choice. */
export function resetAnalytics() {
  if (!posthog) return;
  const off = posthog.optedOut;
  posthog.reset();
  // reset() may clear the stored choice, which would turn stats back on.
  if (off) void posthog.optOut();
}
