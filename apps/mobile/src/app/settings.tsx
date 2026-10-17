import { useClerk } from '@clerk/expo';
import type { Me } from '@insidejoke/shared';
import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import {
  Avatar,
  Body,
  Button,
  Card,
  Eyebrow,
  Heading,
  Loading,
  Rise,
  Screen,
} from '../components/ui';
import { resetAnalytics } from '../lib/analytics';
import { API_URL, useApi, useResource } from '../lib/api';
import { colors as c } from '../lib/theme';

export default function Settings() {
  const { signOut } = useClerk();
  const call = useApi();
  const me = useResource<Me>('/me');
  const [busy, setBusy] = useState(false);
  const { reload } = me;
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  function removeFace() {
    Alert.alert(
      'Remove your face?',
      "Your selfie is deleted and can't be used in any new video. You can add a new one later.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            await call('/me/selfie', { method: 'DELETE' }).catch(() => {});
            setBusy(false);
            router.replace('/');
          },
        },
      ],
    );
  }

  function deleteAccount() {
    Alert.alert(
      'Delete your account?',
      "Your selfie, your groups with your friends' selfies, and every video you made are deleted for good. Unused video credits are lost.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await call('/me', { method: 'DELETE' });
            } catch {
              setBusy(false);
              Alert.alert("We couldn't delete your account", 'Please try again.');
              return;
            }
            resetAnalytics();
            await signOut();
          },
        },
      ],
    );
  }

  const open = (path: string) => void WebBrowser.openBrowserAsync(`${API_URL}${path}`);

  if (!me.data) return <Loading />;
  const credits = me.data.videoCredits;
  return (
    <Screen>
      <Rise>
        <View style={styles.profile}>
          <View style={styles.ring}>
            <Avatar name="You" uri={me.data.selfieUrl} size={112} />
          </View>
          <Body muted>{me.data.hasSelfie ? 'Your face is in the cast' : 'No selfie yet'}</Body>
        </View>
      </Rise>
      <Rise index={1}>
        <Card style={styles.wallet}>
          <Eyebrow color={c.muted}>Your tickets</Eyebrow>
          <Heading>
            {me.data.freeVideoUsed ? 'Free video used' : 'Your first video is free'}
          </Heading>
          {credits > 0 && (
            <Body muted>
              {credits} video {credits === 1 ? 'credit' : 'credits'} left
            </Body>
          )}
        </Card>
      </Rise>
      <Rise index={2}>
        <View style={{ gap: 10 }}>
          <Button
            title={me.data.hasSelfie ? 'Retake my selfie' : 'Add my selfie'}
            kind="secondary"
            onPress={() => router.push('/onboarding/selfie')}
          />
          {me.data.hasSelfie && (
            <Button title="Remove my face" kind="danger" onPress={removeFace} busy={busy} />
          )}
          <Button
            title="Sign out"
            kind="quiet"
            onPress={() => {
              resetAnalytics();
              void signOut();
            }}
          />
        </View>
      </Rise>
      <Rise index={3}>
        <View style={styles.footer}>
          <View style={styles.links}>
            <Button title="Privacy" kind="quiet" onPress={() => open('/privacy')} />
            <Button title="Terms" kind="quiet" onPress={() => open('/terms')} />
            <Button title="Support" kind="quiet" onPress={() => open('/support')} />
          </View>
          <Button title="Delete account" kind="danger" onPress={deleteAccount} busy={busy} />
        </View>
      </Rise>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { alignItems: 'center', gap: 12, marginTop: 8 },
  ring: { padding: 4, borderRadius: 64, borderWidth: 2, borderColor: c.accent },
  wallet: { gap: 4 },
  footer: { gap: 4, marginTop: 24 },
  links: { flexDirection: 'row', justifyContent: 'center' },
});
