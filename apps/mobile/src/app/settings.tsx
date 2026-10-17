import { useClerk } from '@clerk/expo';
import type { Me } from '@insidejoke/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import {
  Avatar,
  Body,
  Button,
  Card,
  Checkbox,
  Eyebrow,
  Heading,
  Loading,
  Rise,
  Screen,
} from '../components/ui';
import { analyticsEnabled, resetAnalytics, setAnalyticsEnabled } from '../lib/analytics';
import { openPage, useApi, useResource } from '../lib/api';
import { colors as c } from '../lib/theme';

export default function Settings() {
  const { signOut } = useClerk();
  const call = useApi();
  const me = useResource<Me>('/me');
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState(analyticsEnabled);
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
      "Your selfie, your groups with your friends' selfies, and every video you made are deleted for good. Unused tickets are lost.",
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
            {credits > 0
              ? `${credits} ${credits === 1 ? 'ticket' : 'tickets'} ready to roll`
              : me.data.freeVideoUsed
                ? 'Each new film is one ticket'
                : 'Your first film is on us'}
          </Heading>
          {credits > 0 && !me.data.freeVideoUsed && <Body muted>Plus your first film, on us.</Body>}
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
          <Checkbox
            checked={stats}
            onToggle={() => {
              setStats(!stats);
              void setAnalyticsEnabled(!stats);
            }}
            style={styles.stats}
          >
            <Body>Share usage stats to help improve the app</Body>
          </Checkbox>
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
            <Button title="Privacy" kind="quiet" onPress={() => openPage('/privacy')} />
            <Button title="Terms" kind="quiet" onPress={() => openPage('/terms')} />
            <Button title="Support" kind="quiet" onPress={() => openPage('/support')} />
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
  stats: { alignItems: 'center', paddingVertical: 6 },
  footer: { gap: 4, marginTop: 24 },
  links: { flexDirection: 'row', justifyContent: 'center' },
});
