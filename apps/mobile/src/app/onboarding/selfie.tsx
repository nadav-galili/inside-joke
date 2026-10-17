import { FACE_CONSENT_TEXT, FACE_CONSENT_VERSION, type UploadTarget } from '@insidejoke/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import {
  Body,
  Button,
  Checkbox,
  ErrorText,
  Eyebrow,
  Pill,
  Pressy,
  Rise,
  Screen,
  Title,
} from '../../components/ui';
import { track } from '../../lib/analytics';
import { useApi } from '../../lib/api';
import { pickSelfie, takeSelfie, uploadSelfie } from '../../lib/selfie';
import { colors as c, radius, type } from '../../lib/theme';

/** The user takes their own selfie and agrees to how it's used. This is their consent record. */
export default function Selfie() {
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

  async function pick() {
    setError('');
    const picked = await pickSelfie();
    if (picked) setUri(picked);
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
      track('selfie_added');
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch {
      setError("We couldn't save your selfie. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          {uri ? (
            <>
              <Button title="Save my selfie" onPress={save} busy={busy} disabled={!agreed} />
              <Button title="Retake" kind="quiet" onPress={shoot} />
            </>
          ) : (
            <>
              <Button title="Take selfie" onPress={shoot} />
              <Button title="Choose from photos" kind="quiet" onPress={pick} />
            </>
          )}
        </>
      }
    >
      <Rise>
        <View style={{ gap: 10, marginTop: 12 }}>
          <Eyebrow>Casting call</Eyebrow>
          <Title>Star in your videos</Title>
          <Body muted>
            Take a clear selfie facing the camera, or pick one from your photos. Only you can add
            your face.
          </Body>
        </View>
      </Rise>
      <Rise index={1}>
        <Pressy
          accessibilityRole="button"
          accessibilityLabel={uri ? 'Retake selfie' : 'Take selfie'}
          onPress={shoot}
          style={[styles.frame, uri && styles.frameFilled]}
        >
          {uri ? (
            <Image source={{ uri }} style={styles.photo} />
          ) : (
            <View style={styles.empty}>
              <View style={styles.faceGuide} />
              <Text style={[type.small, { color: c.muted }]}>Tap to open the camera</Text>
            </View>
          )}
        </Pressy>
      </Rise>
      {!uri && (
        <Rise index={2}>
          <View style={styles.tips}>
            {['Face the camera', 'Good light', 'No sunglasses'].map((t) => (
              <Pill key={t} label={t} />
            ))}
          </View>
        </Rise>
      )}
      {uri && (
        <Rise>
          <Checkbox
            checked={agreed}
            onToggle={() => setAgreed(!agreed)}
            style={[styles.consent, agreed && { borderColor: c.accent }]}
          >
            <Body small>{FACE_CONSENT_TEXT}</Body>
          </Checkbox>
        </Rise>
      )}
    </Screen>
  );
}

const FRAME = 230;

const styles = StyleSheet.create({
  frame: {
    width: FRAME,
    height: FRAME,
    borderRadius: FRAME / 2,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: c.accent,
    backgroundColor: c.card,
    overflow: 'hidden',
    marginVertical: 8,
  },
  frameFilled: { borderStyle: 'solid', borderWidth: 4 },
  photo: { width: '100%', height: '100%' },
  empty: { alignItems: 'center', gap: 14 },
  faceGuide: {
    width: 92,
    height: 116,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: c.border,
  },
  tips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  consent: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
    backgroundColor: c.card,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: 16,
  },
});
