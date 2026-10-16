import { FACE_CONSENT_TEXT, FACE_CONSENT_VERSION, type UploadTarget } from '@insidejoke/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, ErrorText, Screen, Title } from '../../components/ui';
import { useApi } from '../../lib/api';
import { takeSelfie, uploadSelfie } from '../../lib/selfie';
import { useColors } from '../../lib/theme';

/** The user takes their own selfie and agrees to how it's used. This is their consent record. */
export default function Selfie() {
  const c = useColors();
  const call = useApi();
  const [uri, setUri] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function shoot() {
    setError('');
    const taken = await takeSelfie();
    if (taken) setUri(taken);
    else
      setError('Inside Joke needs the camera to take your selfie. You can allow it in Settings.');
  }

  async function save() {
    if (!uri) return;
    setBusy(true);
    setError('');
    try {
      const target = await call<UploadTarget>('/me/selfie/upload-url', { method: 'POST' });
      await uploadSelfie(uri, target);
      await call('/me/selfie', {
        method: 'POST',
        body: JSON.stringify({ key: target.key, consentTextVersion: FACE_CONSENT_VERSION }),
      });
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch {
      setError("We couldn't save your selfie. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Star in your videos</Title>
      <Body muted>
        Take a clear selfie facing the camera, in good light. Only you can add your face.
      </Body>
      <Pressable onPress={shoot} style={[styles.photo, { backgroundColor: c.card }]}>
        {uri ? (
          <Image source={{ uri }} style={styles.photo} />
        ) : (
          <Text style={{ fontSize: 48 }}>🤳</Text>
        )}
      </Pressable>
      <Button
        title={uri ? 'Retake' : 'Take selfie'}
        kind={uri ? 'secondary' : 'primary'}
        onPress={shoot}
      />
      {uri && (
        <>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            onPress={() => setAgreed(!agreed)}
            style={styles.check}
          >
            <Text style={{ fontSize: 22 }}>{agreed ? '☑️' : '⬜️'}</Text>
            <Body style={{ flex: 1 }}>{FACE_CONSENT_TEXT}</Body>
          </Pressable>
          <Button title="Save my selfie" onPress={save} busy={busy} disabled={!agreed} />
        </>
      )}
      <ErrorText>{error}</ErrorText>
      <View style={{ height: 24 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: {
    width: 200,
    height: 200,
    borderRadius: 100,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  check: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
});
