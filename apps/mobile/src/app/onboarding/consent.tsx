import { AI_CONSENT_VERSION, AI_PROVIDERS } from '@insidejoke/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Body,
  Button,
  Card,
  ErrorText,
  Eyebrow,
  Heading,
  Pressy,
  Rise,
  Screen,
  Title,
} from '../../components/ui';
import { colors as c } from '../../lib/theme';
import { track } from '../../lib/analytics';
import { useApi } from '../../lib/api';

/**
 * Names the AI services before any text or photo leaves the device, and asks for explicit
 * permission (App Store guideline 5.1.2(i)).
 */
export default function AiConsent() {
  const call = useApi();
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function agree() {
    setBusy(true);
    try {
      await call('/me/ai-consent', {
        method: 'POST',
        body: JSON.stringify({ version: AI_CONSENT_VERSION, adult: true }),
      });
      track('ai_consent_given');
      router.replace('/');
    } catch {
      setError('Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          <Pressy
            accessibilityRole="checkbox"
            accessibilityState={{ checked: adult }}
            haptic="tick"
            onPress={() => setAdult(!adult)}
            style={styles.adult}
          >
            <View style={[styles.box, adult && styles.boxOn]}>
              {adult && <Text style={styles.boxMark}>✓</Text>}
            </View>
            <Body style={{ flex: 1 }}>I'm 18 or older.</Body>
          </Pressy>
          <Button title="I agree, let's go" onPress={agree} busy={busy} disabled={!adult} />
        </>
      }
    >
      <Rise>
        <View style={{ gap: 10, marginTop: 12 }}>
          <Eyebrow>Before the cameras roll</Eyebrow>
          <Title>How your videos are made</Title>
          <Body muted>
            Inside Joke uses AI services to write and film your videos. To make one, we send them:
          </Body>
        </View>
      </Rise>
      <View style={{ gap: 10 }}>
        {AI_PROVIDERS.map((p, i) => (
          <Rise key={p.name} index={i + 1}>
            <Card style={styles.credit}>
              <Eyebrow color={c.muted}>{CREDITS[i] ?? 'With'}</Eyebrow>
              <Heading>{p.name}</Heading>
              <Body muted>Gets {p.receives}.</Body>
            </Card>
          </Rise>
        ))}
      </View>
      <Rise index={AI_PROVIDERS.length + 1}>
        <View style={{ gap: 12 }}>
          {PROMISES.map((t) => (
            <View key={t} style={styles.promise}>
              <View style={styles.tick}>
                <Text style={styles.tickMark}>✓</Text>
              </View>
              <Body style={{ flex: 1 }}>{t}</Body>
            </View>
          ))}
        </View>
      </Rise>
    </Screen>
  );
}

/** Credit lines for the providers, in the order AI_PROVIDERS lists them. */
const CREDITS = ['Written by', 'Filmed by'];

const PROMISES = [
  "They use it only to make your video and don't train on it.",
  'We delete the chat text once you approve the script.',
  'You can remove your selfie at any time in Settings.',
];

const styles = StyleSheet.create({
  credit: { gap: 6 },
  promise: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginTop: 1,
    backgroundColor: c.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickMark: { color: c.accent, fontSize: 12, fontWeight: '900' },
  adult: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 6 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: c.accent, borderColor: c.accent },
  boxMark: { color: c.onAccent, fontSize: 14, fontWeight: '900' },
});
