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
  Eyebrow,
  Heading,
  Loading,
  Rise,
  Screen,
} from '../components/ui';
import { useApi, useResource } from '../lib/api';
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
          <Button title="Sign out" kind="quiet" onPress={() => void signOut()} />
        </View>
      </Rise>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { alignItems: 'center', gap: 12, marginTop: 8 },
  ring: { padding: 4, borderRadius: 64, borderWidth: 2, borderColor: c.accent },
  wallet: { gap: 4 },
});
