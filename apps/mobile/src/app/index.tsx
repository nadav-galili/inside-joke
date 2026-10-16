import type { GroupSummary, Me } from '@insidejoke/shared';
import { Link, Redirect, router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Pressable, Text } from 'react-native';
import { Body, Button, Card, ErrorText, Loading, Screen } from '../components/ui';
import { useResource } from '../lib/api';
import { identify } from '../lib/analytics';
import { configurePurchases } from '../lib/purchases';
import { usePushNotifications } from '../lib/push';
import { useColors } from '../lib/theme';

/** Home: the user's groups. Sends a new user through AI consent and their selfie first. */
export default function Home() {
  const c = useColors();
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
      <Screen>
        <ErrorText>We couldn't reach Inside Joke. Check your connection.</ErrorText>
        <Button title="Try again" onPress={() => void me.reload()} />
      </Screen>
    );
  }
  if (!me.data.aiConsented) return <Redirect href="/onboarding/consent" />;
  // First run only: someone who later removes their face keeps using the app without it.
  if (!me.data.hasSelfie && groups.data?.length === 0)
    return <Redirect href="/onboarding/selfie" />;

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/settings" asChild>
              <Pressable accessibilityLabel="Settings" hitSlop={12}>
                <Text style={{ fontSize: 22 }}>⚙️</Text>
              </Pressable>
            </Link>
          ),
        }}
      />
      {groups.data?.length === 0 && (
        <Body muted>
          Start a group for your friends, then share its invite link in your group chat. Each friend
          adds their own selfie to star in your videos.
        </Body>
      )}
      {groups.data?.map((g) => (
        <Card key={g.id} onPress={() => router.push(`/groups/${g.id}`)}>
          <Text style={{ color: c.text, fontSize: 19, fontWeight: '700' }}>{g.name}</Text>
          <Body muted>
            {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
          </Body>
        </Card>
      ))}
      <Button title="New group" onPress={() => router.push('/groups/new')} />
    </Screen>
  );
}
