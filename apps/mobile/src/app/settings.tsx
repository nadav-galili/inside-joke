import { useClerk } from '@clerk/expo';
import type { Me } from '@insidejoke/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Image } from 'react-native';
import { Body, Button, Loading, Screen } from '../components/ui';
import { resetAnalytics } from '../lib/analytics';
import { useApi, useResource } from '../lib/api';

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
  return (
    <Screen>
      {me.data.selfieUrl && (
        <Image
          source={{ uri: me.data.selfieUrl }}
          style={{ width: 120, height: 120, borderRadius: 60, alignSelf: 'center' }}
        />
      )}
      <Body muted>
        {me.data.freeVideoUsed ? 'Your free video is used.' : 'Your first video is free.'}{' '}
        {me.data.videoCredits > 0 &&
          `You have ${me.data.videoCredits} video ${me.data.videoCredits === 1 ? 'credit' : 'credits'}.`}
      </Body>
      <Button
        title="Retake my selfie"
        kind="secondary"
        onPress={() => router.push('/onboarding/selfie')}
      />
      {me.data.hasSelfie && (
        <Button title="Remove my face" kind="danger" onPress={removeFace} busy={busy} />
      )}
      <Button
        title="Sign out"
        kind="secondary"
        onPress={() => {
          resetAnalytics();
          void signOut();
        }}
      />
    </Screen>
  );
}
