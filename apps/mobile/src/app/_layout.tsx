import { ClerkProvider, useAuth } from '@clerk/expo';
import * as Sentry from '@sentry/react-native';
import { tokenCache } from '@clerk/expo/token-cache';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Loading } from '../components/ui';
import { useColors } from '../lib/theme';

// Crash reporting when a DSN is set; local builds without one report nothing.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
});

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) throw new Error('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is required');

function Routes() {
  const { isLoaded, isSignedIn } = useAuth();
  const c = useColors();
  if (!isLoaded) return <Loading />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.bg },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!isSignedIn}>
        <Stack.Screen name="index" options={{ title: 'Inside Joke' }} />
        <Stack.Screen name="onboarding/consent" options={{ title: '', gestureEnabled: false }} />
        <Stack.Screen name="onboarding/selfie" options={{ title: 'Your selfie' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="groups/new" options={{ title: 'New group', presentation: 'modal' }} />
        <Stack.Screen name="groups/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="groups/[id]/new-video" options={{ title: 'New video' }} />
        <Stack.Screen name="videos/[id]" options={{ title: '' }} />
      </Stack.Protected>
    </Stack>
  );
}

function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <StatusBar style="auto" />
      <Routes />
    </ClerkProvider>
  );
}

export default Sentry.wrap(RootLayout);
