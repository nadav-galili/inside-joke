import { AI_CONSENT_VERSION, AI_PROVIDERS } from '@insidejoke/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Card, ErrorText, Screen, Title } from '../../components/ui';
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
    <Screen>
      <Title>How your videos are made</Title>
      <Body>
        Inside Joke uses AI services to write and film your videos. To make one, we send them:
      </Body>
      <View style={{ gap: 10 }}>
        {AI_PROVIDERS.map((p) => (
          <Card key={p.name}>
            <Body style={{ fontWeight: '700' }}>{p.name}</Body>
            <Body muted>Gets {p.receives}.</Body>
          </Card>
        ))}
      </View>
      <Body muted>
        They use it only to make your video and don't train on it. We delete the chat text once you
        approve the script. You can remove your selfie at any time in Settings.
      </Body>
      <View style={{ flex: 1 }} />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: adult }}
        onPress={() => setAdult(!adult)}
        style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}
      >
        <Text style={{ fontSize: 22 }}>{adult ? '☑️' : '⬜️'}</Text>
        <Body style={{ flex: 1 }}>I'm 18 or older.</Body>
      </Pressable>
      <Button title="I agree" onPress={agree} busy={busy} disabled={!adult} />
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
