import { VIDEO_STYLES, type GroupSummary, type Me, type VideoStyle } from '@insidejoke/shared';
import { Link, Redirect, router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GenrePoster } from '../components/cinema';
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
  Title,
} from '../components/ui';
import { identify } from '../lib/analytics';
import { useResource } from '../lib/api';
import { configurePurchases } from '../lib/purchases';
import { usePushNotifications } from '../lib/push';
import { colors as c, type } from '../lib/theme';

/** Home: the user's groups. Sends a new user through AI consent and their selfie first. */
export default function Home() {
  const me = useResource<Me>('/me');
  const groups = useResource<GroupSummary[]>('/groups');
  const onboarded = !!me.data?.aiConsented && !!me.data?.hasSelfie;
  usePushNotifications(onboarded);
  const userId = me.data?.id;
  useEffect(() => {
    if (!userId) return;
    identify(userId);
    configurePurchases(userId);
  }, [userId]);

  const { reload: reloadMe } = me;
  const { reload: reloadGroups } = groups;
  useFocusEffect(
    useCallback(() => {
      void reloadMe();
      void reloadGroups();
    }, [reloadMe, reloadGroups]),
  );

  if (me.loading || groups.loading) return <Loading />;
  if (me.error || !me.data) {
    return (
      <Screen footer={<Button title="Try again" onPress={() => void me.reload()} />}>
        <View style={{ gap: 10, marginTop: 40 }}>
          <Eyebrow>Lost the signal</Eyebrow>
          <Title>We couldn't reach Inside Joke</Title>
          <Body muted>Check your connection and try again.</Body>
        </View>
      </Screen>
    );
  }
  if (!me.data.aiConsented) return <Redirect href="/onboarding/consent" />;
  // First run only: someone who later removes their face keeps using the app without it.
  if (!me.data.hasSelfie && groups.data?.length === 0)
    return <Redirect href="/onboarding/selfie" />;

  const empty = groups.data?.length === 0;
  return (
    <Screen footer={<Button title="Start a group" onPress={() => router.push('/groups/new')} />}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/settings" asChild>
              <Pressable accessibilityLabel="Settings" hitSlop={12}>
                <Avatar name="You" uri={me.data?.selfieUrl} size={34} />
              </Pressable>
            </Link>
          ),
        }}
      />
      <Rise>
        <View style={{ gap: 6 }}>
          <Eyebrow>Now showing</Eyebrow>
          <Title>{empty ? 'Start your studio' : 'Your groups'}</Title>
        </View>
      </Rise>
      {empty && (
        <Rise index={1}>
          <Card style={{ gap: 18, padding: 20 }}>
            {HOW_IT_WORKS.map((step, i) => (
              <View key={step} style={styles.howRow}>
                <Text style={styles.howNumber}>{i + 1}</Text>
                <Body style={{ flex: 1 }}>{step}</Body>
              </View>
            ))}
          </Card>
        </Rise>
      )}
      {groups.data?.map((g, i) => (
        <Rise key={g.id} index={i + 1}>
          <Card onPress={() => router.push(`/groups/${g.id}`)} style={styles.group}>
            <GenrePoster
              genre={posterFor(g.id)}
              title={g.name.trim().charAt(0).toUpperCase()}
              height={72}
              compact
              style={styles.groupPoster}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Heading>{g.name}</Heading>
              <Body small muted>
                {g.memberCount} in the cast
              </Body>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Card>
        </Rise>
      ))}
    </Screen>
  );
}

const HOW_IT_WORKS = [
  'Start a group for your friends.',
  'Share its invite link in your group chat. Each friend adds their own selfie.',
  "Paste a moment from the chat and we'll film it, starring all of you.",
];

/** Gives each group a stable poster colour. */
function posterFor(id: string): VideoStyle {
  let h = 0;
  for (const ch of id) h = (h + ch.charCodeAt(0)) | 0;
  return VIDEO_STYLES[h % VIDEO_STYLES.length]!;
}

const styles = StyleSheet.create({
  howRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  howNumber: { ...type.heading, color: c.accent, width: 18 },
  group: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12 },
  groupPoster: { width: 72, padding: 10 },
  chevron: { color: c.faint, fontSize: 28, marginRight: 4 },
});
