import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useApi } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Asks for push permission once the user has a video on the way, and sends the token to the API so
 * the worker can say when it's ready. Tapping the push opens the video.
 */
export function usePushNotifications(enabled: boolean) {
  const call = useApi();

  useEffect(() => {
    if (!enabled) return;
    void (async () => {
      const { granted } = await Notifications.requestPermissionsAsync();
      const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
      if (!granted || !projectId) return;
      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      await call('/me/push-token', { method: 'POST', body: JSON.stringify({ token }) });
    })().catch((e) => console.warn('push registration failed', e));
  }, [enabled, call]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const videoId = response.notification.request.content.data?.videoId;
      if (typeof videoId === 'string') router.push(`/videos/${videoId}`);
    });
    return () => sub.remove();
  }, []);
}
