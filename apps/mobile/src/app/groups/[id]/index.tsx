import { MIN_CAST, type GroupDetail, type VideoSummary } from '@insidejoke/shared';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, Loading, Screen } from '../../../components/ui';
import { useApi, useResource } from '../../../lib/api';
import { isInProgress, STATUS_LABELS, STYLE_LABELS } from '../../../lib/styles';
import { useColors } from '../../../lib/theme';

export default function Group() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const call = useApi();
  const group = useResource<GroupDetail>(`/groups/${id}`);
  const videos = useResource<VideoSummary[]>(`/groups/${id}/videos`, {
    pollMs: 5000,
    poll: (list) => list.some((v) => isInProgress(v.status)),
  });
  const { reload: reloadGroup } = group;
  const { reload: reloadVideos } = videos;
  useFocusEffect(
    useCallback(() => {
      void reloadGroup();
      void reloadVideos();
    }, [reloadGroup, reloadVideos]),
  );

  if (!group.data) return <Loading />;
  const g = group.data;
  const castable = g.members.filter((m) => m.hasFace);

  function invite() {
    void Share.share({
      message: `Star in our ${g.name} videos on Inside Joke! Add your selfie here: ${g.inviteUrl}`,
    });
  }

  function remove(memberId: string, name: string) {
    Alert.alert(`Remove ${name}?`, "They won't be in any new videos.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await call(`/groups/${id}/members/${memberId}`, { method: 'DELETE' }).catch(() => {});
          void group.reload();
        },
      },
    ]);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: g.name }} />
      <Button
        title="Make a video"
        onPress={() => router.push(`/groups/${id}/new-video`)}
        disabled={castable.length < MIN_CAST}
      />
      {castable.length < MIN_CAST && (
        <Body muted>
          A video needs at least {MIN_CAST} people with a selfie. Invite your friends to add theirs.
        </Body>
      )}

      {videos.data && videos.data.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.heading, { color: c.text }]}>Videos</Text>
          {videos.data.map((v) => (
            <Card key={v.id} onPress={() => router.push(`/videos/${v.id}`)}>
              <Text style={[styles.cardTitle, { color: c.text }]}>
                {STYLE_LABELS[v.style].emoji} {v.title ?? STYLE_LABELS[v.style].label}
              </Text>
              <Body muted>{STATUS_LABELS[v.status]}</Body>
            </Card>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={[styles.heading, { color: c.text }]}>Cast</Text>
        {g.members.map((m) => (
          <View key={m.id} style={[styles.member, { borderColor: c.border }]}>
            <Text style={{ fontSize: 20 }}>{m.hasFace ? '🙂' : '⏳'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 17 }}>
                {m.displayName}
                {m.isMe ? ' (you)' : ''}
              </Text>
              {!m.hasFace && <Body muted>No selfie yet</Body>}
            </View>
            {!m.isMe && (
              <Pressable hitSlop={10} onPress={() => remove(m.id, m.displayName)}>
                <Text style={{ color: c.muted }}>Remove</Text>
              </Pressable>
            )}
          </View>
        ))}
        <Button title="Invite friends" kind="secondary" onPress={invite} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, marginTop: 8 },
  heading: { fontSize: 20, fontWeight: '800' },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
