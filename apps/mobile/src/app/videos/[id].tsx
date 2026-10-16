import type { ApproveResult, Beat, Me, Script, VideoDetail } from '@insidejoke/shared';
import { File, Paths } from 'expo-file-system';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { Body, Button, Card, ErrorText, Loading, Screen, Title } from '../../components/ui';
import { track } from '../../lib/analytics';
import { useApi, useResource } from '../../lib/api';
import { buyVideo, videoPrice } from '../../lib/purchases';
import { isInProgress, STATUS_LABELS } from '../../lib/styles';
import { useColors } from '../../lib/theme';

/** One video from script to share: it shows whatever step the video is at. */
export default function VideoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const video = useResource<VideoDetail>(`/videos/${id}`, {
    pollMs: 4000,
    poll: (v) => isInProgress(v.status),
  });

  if (video.error) {
    return (
      <Screen>
        <ErrorText>We couldn't load this video.</ErrorText>
        <Button title="Try again" onPress={() => void video.reload()} />
      </Screen>
    );
  }
  if (!video.data) return <Loading />;
  const v = video.data;
  const title = <Stack.Screen options={{ title: v.title ?? '' }} />;

  switch (v.status) {
    case 'draft':
      return (
        <Waiting title={title} text="Writing the script…" hint="This takes about half a minute." />
      );
    case 'script_ready':
      return (
        <>
          {title}
          <ScriptReview video={v} onChange={(next) => video.setData(next)} reload={video.reload} />
        </>
      );
    case 'paid':
    case 'generating':
      return (
        <Waiting
          title={title}
          text={STATUS_LABELS[v.status]}
          hint="This takes a few minutes. You can leave the app; we'll send you a notification when it's ready."
        />
      );
    case 'ready':
      return (
        <>
          {title}
          <Player video={v} />
        </>
      );
    case 'failed':
    case 'deleted':
      return (
        <Screen>
          {title}
          <Title>We couldn't make this video</Title>
          <Body>
            Sometimes the AI turns a scene down or a cast member removed their selfie. You weren't
            charged: if you'd paid, it's back on your account for the next video.
          </Body>
          <Button
            title="Back to the group"
            onPress={() => router.replace(`/groups/${v.groupId}`)}
          />
        </Screen>
      );
  }
}

function Waiting({ title, text, hint }: { title: React.ReactNode; text: string; hint: string }) {
  const c = useColors();
  return (
    <Screen>
      {title}
      <View style={styles.center}>
        <ActivityIndicator size="large" color={c.accent} />
        <Title>{text}</Title>
        <Body muted style={{ textAlign: 'center' }}>
          {hint}
        </Body>
      </View>
    </Screen>
  );
}

/** Shows the script for approval. Lines can be tweaked, or the whole script rewritten. */
function ScriptReview({
  video,
  onChange,
  reload,
}: {
  video: VideoDetail;
  onChange: (v: VideoDetail) => void;
  reload: () => Promise<void>;
}) {
  const c = useColors();
  const call = useApi();
  const me = useResource<Me>('/me');
  const [draft, setDraft] = useState<Script>(video.script!);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'approve' | 'regenerate' | null>(null);
  const [error, setError] = useState('');
  const [storePrice, setStorePrice] = useState<string | null>(null);
  useEffect(() => {
    void videoPrice().then(setStorePrice);
  }, []);
  const roles = new Map(draft.cast.map((r) => [r.role, r.memberId]));
  const names = new Map(video.cast.map((m) => [m.memberId, m.displayName]));
  const speaker = (b: Beat) =>
    b.speakerRole ? (names.get(roles.get(b.speakerRole) ?? '') ?? b.speakerRole) : 'Narrator';

  function edit(i: number, field: 'subtitle' | 'line', value: string) {
    setDirty(true);
    setDraft((s) => ({
      ...s,
      beats: s.beats.map((b, j) => (j === i ? { ...b, [field]: value } : b)),
    }));
  }

  async function approve() {
    setBusy('approve');
    setError('');
    try {
      if (dirty) {
        onChange(
          await call<VideoDetail>(`/videos/${video.id}/script`, {
            method: 'PUT',
            body: JSON.stringify({ script: draft }),
          }),
        );
        setDirty(false);
      }
      const approveOnce = () =>
        call<ApproveResult>(`/videos/${video.id}/approve`, { method: 'POST' });
      let result = await approveOnce();
      if ('error' in result) {
        // No free video or credit left: buy one through Apple, then approve with it.
        const bought = await buyVideo(() => call<Me>('/me'));
        if (bought === 'cancelled') return;
        if (bought === 'pending') {
          Alert.alert(
            'Payment received',
            "Your video credit is on its way. Tap Make the video again in a moment; you won't be charged twice.",
          );
          return;
        }
        result = await approveOnce();
      }
      if ('error' in result) throw new Error('approve failed after purchase');
      track('script_approved', { paidWith: result.paidWith });
      await reload();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function regenerate() {
    setBusy('regenerate');
    try {
      await call(`/videos/${video.id}/regenerate`, { method: 'POST' });
      track('script_regenerated');
      await reload();
    } catch {
      setError("We couldn't write a new script.");
    } finally {
      setBusy(null);
    }
  }

  const price = !me.data
    ? ''
    : !me.data.freeVideoUsed
      ? ' (free)'
      : me.data.videoCredits > 0
        ? ' (1 credit)'
        : ` (${storePrice ?? '$4.99'})`;

  return (
    <Screen>
      <Title>{draft.title}</Title>
      <Body muted>{draft.premise}</Body>
      {draft.beats.map((b, i) => (
        <Card key={`${b.fromSecond}-${b.toSecond}`}>
          <Text style={{ color: c.muted, fontSize: 13, fontWeight: '700' }}>
            {b.fromSecond}s to {b.toSecond}s
          </Text>
          <Body>{b.action}</Body>
          {(b.line !== '' || b.subtitle !== '') && (
            <>
              <Text style={{ color: c.text, fontWeight: '700', marginTop: 4 }}>{speaker(b)}</Text>
              <TextInput
                value={b.subtitle}
                onChangeText={(t) => edit(i, 'subtitle', t)}
                multiline
                accessibilityLabel="Subtitle"
                style={[styles.edit, { color: c.text, borderColor: c.border }]}
              />
              <TextInput
                value={b.line}
                onChangeText={(t) => edit(i, 'line', t)}
                multiline
                accessibilityLabel="Spoken line"
                style={[styles.edit, styles.small, { color: c.muted, borderColor: c.border }]}
              />
            </>
          )}
        </Card>
      ))}
      <Body muted>The top line is the subtitle; the smaller one is what the cast says.</Body>
      <Button
        title={`Make the video${price}`}
        onPress={approve}
        busy={busy === 'approve'}
        disabled={busy !== null}
      />
      {video.canRegenerate && (
        <Button
          title="Write a different script"
          kind="secondary"
          onPress={regenerate}
          busy={busy === 'regenerate'}
          disabled={busy !== null}
        />
      )}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

/** Plays the finished video and shares the file through the share sheet. */
function Player({ video }: { video: VideoDetail }) {
  const call = useApi();
  const player = useVideoPlayer(video.playUrl, (p) => {
    p.loop = true;
    p.play();
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    track('video_watched');
  }, []);

  async function share() {
    setBusy(true);
    setError('');
    try {
      const file = new File(Paths.cache, `inside-joke-${video.id}.mp4`);
      if (!file.exists) await File.downloadFileAsync(video.playUrl!, file);
      await Sharing.shareAsync(file.uri, { mimeType: 'video/mp4', UTI: 'public.mpeg-4' });
      track('video_shared');
    } catch {
      setError("We couldn't share the video. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    Alert.alert('Delete this video?', "It's deleted for good.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await call(`/videos/${video.id}`, { method: 'DELETE' }).catch(() => {});
          router.replace(`/groups/${video.groupId}`);
        },
      },
    ]);
  }

  return (
    <Screen>
      <VideoView player={player} style={styles.video} contentFit="contain" nativeControls />
      <Button title="Send to the group" onPress={share} busy={busy} />
      <Button title="Delete video" kind="danger" onPress={remove} />
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 12 },
  edit: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 8, fontSize: 16 },
  small: { fontSize: 14 },
  video: { width: '100%', aspectRatio: 9 / 16, borderRadius: 16, backgroundColor: '#000' },
});
