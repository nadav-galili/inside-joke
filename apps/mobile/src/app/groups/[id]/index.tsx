import {
  MIN_CAST,
  type GroupDetail,
  type VideoStatus,
  type VideoSummary,
} from '@insidejoke/shared';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Dimensions, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { GenrePoster } from '../../../components/cinema';
import {
  Avatar,
  Body,
  Button,
  Card,
  Eyebrow,
  FaceStack,
  Loading,
  Pill,
  Pressy,
  Rise,
  Screen,
  Title,
} from '../../../components/ui';
import { useApi, useResource } from '../../../lib/api';
import { isInProgress, STATUS_LABELS, STYLE_LABELS } from '../../../lib/styles';
import { colors as c, type } from '../../../lib/theme';

/** Two posters a row, inside the screen's 20pt gutters. */
const TILE = (Dimensions.get('window').width - 40 - 12) / 2;

export default function Group() {
  const { id } = useLocalSearchParams<{ id: string }>();
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

  const needed = MIN_CAST - castable.length;
  return (
    <Screen
      footer={
        <>
          {needed > 0 && (
            <Body small muted style={{ textAlign: 'center' }}>
              {needed === 1 ? 'One more friend needs' : `${needed} more friends need`} to add a
              selfie before you can make a video.
            </Body>
          )}
          <Button
            title="Make a video"
            onPress={() => router.push(`/groups/${id}/new-video`)}
            disabled={needed > 0}
          />
        </>
      }
    >
      <Stack.Screen options={{ title: '' }} />
      <Rise>
        <View style={{ gap: 12 }}>
          <Eyebrow>Group</Eyebrow>
          <Title>{g.name}</Title>
          <View style={styles.castLine}>
            <FaceStack names={g.members.map((m) => m.displayName)} />
            <Body small muted>
              {castable.length} of {g.members.length} ready to film
            </Body>
          </View>
        </View>
      </Rise>

      {videos.data && videos.data.length > 0 && (
        <View style={styles.section}>
          <Eyebrow color={c.muted}>Premieres</Eyebrow>
          <View style={styles.grid}>
            {videos.data.map((v, i) => (
              <Rise key={v.id} index={i + 1}>
                <Pressy
                  accessibilityRole="button"
                  accessibilityLabel={`${v.title ?? STYLE_LABELS[v.style].label}, ${STATUS_LABELS[v.status]}`}
                  onPress={() => router.push(`/videos/${v.id}`)}
                  style={styles.tile}
                >
                  <GenrePoster
                    genre={v.style}
                    title={v.title ?? STYLE_LABELS[v.style].label}
                    height={200}
                    playable={v.status === 'ready'}
                  />
                  <Pill label={SHORT_STATUS[v.status]} live={isInProgress(v.status)} />
                </Pressy>
              </Rise>
            ))}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Eyebrow color={c.muted}>Cast</Eyebrow>
        <Card style={{ paddingVertical: 4, gap: 0 }}>
          {g.members.map((m, i) => (
            <View
              key={m.id}
              style={[styles.member, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth }]}
            >
              <Avatar name={m.displayName} size={40} dim={!m.hasFace} />
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '600' }}>
                  {m.displayName}
                  {m.isMe ? ' (you)' : ''}
                </Body>
                <Body small muted>
                  {m.hasFace ? 'Ready to film' : 'Waiting for a selfie'}
                </Body>
              </View>
              {!m.isMe && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${m.displayName}`}
                  hitSlop={10}
                  onPress={() => remove(m.id, m.displayName)}
                >
                  <Text style={[type.small, { color: c.faint }]}>Remove</Text>
                </Pressable>
              )}
            </View>
          ))}
        </Card>
        <Button title="Invite friends" kind="secondary" onPress={invite} />
      </View>
    </Screen>
  );
}

/** Status in a word or two, to fit under a poster. */
const SHORT_STATUS: Record<VideoStatus, string> = {
  draft: 'Writing',
  script_ready: 'Script ready',
  paid: 'Filming',
  generating: 'Final cut',
  ready: 'Ready',
  failed: "Couldn't make",
  deleted: 'Deleted',
};

const styles = StyleSheet.create({
  castLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  section: { gap: 12, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: TILE, gap: 8, alignItems: 'flex-start' },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderColor: c.border,
  },
});
