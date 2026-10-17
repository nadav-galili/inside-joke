import { ClerkProvider, useAuth } from '@clerk/expo';
import * as Sentry from '@sentry/react-native';
import { tokenCache } from '@clerk/expo/token-cache';
import {
  BricolageGrotesque_500Medium,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import { CourierPrime_400Regular, CourierPrime_700Bold } from '@expo-google-fonts/courier-prime';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Loading } from '../components/ui';
import { colors as c, fonts } from '../lib/theme';

void SplashScreen.preventAutoHideAsync();

// Crash reporting when a DSN is set; local builds without one report nothing.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
});

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) throw new Error('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is required');

function Routes() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <Loading />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        headerTitleStyle: { fontFamily: fonts.displayBold, fontSize: 17 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.bg },
        headerBackButtonDisplayMode: 'minimal',
        animation: 'default',
      }}
    >
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ title: '' }} />
      </Stack.Protected>
      <Stack.Protected guard={!!isSignedIn}>
        <Stack.Screen name="index" options={{ title: '' }} />
        <Stack.Screen name="onboarding/consent" options={{ title: '', gestureEnabled: false }} />
        <Stack.Screen name="onboarding/selfie" options={{ title: '' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen
          name="groups/new"
          options={{
            title: '',
            presentation: 'modal',
            headerStyle: { backgroundColor: c.card },
            contentStyle: { backgroundColor: c.card },
          }}
        />
        <Stack.Screen name="groups/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="groups/[id]/new-video" options={{ title: '' }} />
        <Stack.Screen name="videos/[id]" options={{ title: '' }} />
      </Stack.Protected>
    </Stack>
  );
}

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_500Medium,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    CourierPrime_400Regular,
    CourierPrime_700Bold,
  });
  const ready = fontsLoaded || !!fontError;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <StatusBar style="light" />
      <Routes />
    </ClerkProvider>
  );
}

export default Sentry.wrap(RootLayout);
