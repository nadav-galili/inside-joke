import type { ApproveResult, Beat, Me, Script, VideoDetail } from '@insidejoke/shared';
import { File, Paths } from 'expo-file-system';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  Curtain,
  FilmLeader,
  ScriptPage,
  scriptText,
  Steps,
  Ticket,
  type StepState,
} from '../../components/cinema';
import {
  Body,
  Button,
  ErrorText,
  Eyebrow,
  Loading,
  Rise,
  Screen,
  Title,
} from '../../components/ui';
import { track } from '../../lib/analytics';
import { useApi, useResource } from '../../lib/api';
import { buyVideo, videoPrice } from '../../lib/purchases';
import { isInProgress, STATUS_LABELS, STYLE_LABELS } from '../../lib/styles';
import { colors as c, radius } from '../../lib/theme';

/** One video from script to share: it shows whatever step the video is at. */
export default function VideoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const video = useResource<VideoDetail>(`/videos/${id}`, {
    pollMs: 4000,
    poll: (v) => isInProgress(v.status),
  });

  if (video.error) {
    return (
      <Screen footer={<Button title="Try again" onPress={() => void video.reload()} />}>
        <View style={{ gap: 10, marginTop: 40 }}>
          <Eyebrow>Lost the signal</Eyebrow>
          <Title>We couldn't load this video</Title>
          <Body muted>Check your connection and try again.</Body>
        </View>
      </Screen>
    );
  }
  if (!video.data) return <Loading />;
  const v = video.data;
  const header = <Stack.Screen options={{ title: '' }} />;
  const names = v.cast.map((m) => m.displayName);
  const filming = names.length ? `Filming ${listNames(names)}` : 'Filming the cast';

  switch (v.status) {
    case 'draft':
      return (
        <Waiting
          header={header}
          text="Writing the script"
          hint="This takes about half a minute."
          steps={[
            ['Reading the chat', 'done'],
            ['Writing the script', 'now'],
            ['Your approval', 'later'],
          ]}
        />
      );
    case 'script_ready':
      return (
        <>
          {header}
          <ScriptReview video={v} onChange={(next) => video.setData(next)} reload={video.reload} />
        </>
      );
    case 'paid':
    case 'generating':
      return (
        <Waiting
          header={header}
          text={STATUS_LABELS[v.status].replace('…', '')}
          hint="This takes a few minutes. You can leave the app; we'll send you a notification when it premieres."
          steps={[
            ['Script approved', 'done'],
            [filming, v.status === 'paid' ? 'now' : 'done'],
            ['Subtitles and final cut', v.status === 'paid' ? 'later' : 'now'],
          ]}
        />
      );
    case 'ready':
      return (
        <>
          {header}
          <Player video={v} />
        </>
      );
    case 'failed':
    case 'deleted':
      return (
        <Screen
          footer={
            <Button
              title="Back to the group"
              onPress={() => router.replace(`/groups/${v.groupId}`)}
            />
          }
        >
          {header}
          <View style={{ gap: 10, marginTop: 24 }}>
            <Eyebrow>Cut</Eyebrow>
            <Title>We couldn't make this video</Title>
            <Body muted>
              Sometimes the AI turns a scene down or a cast member removed their selfie. You weren't
              charged: if you'd paid, it's back on your account for the next video.
            </Body>
          </View>
        </Screen>
      );
  }
}

/** "Dani", "Dani and Ziv", "Dani, Ziv and Maya". */
function listNames(names: string[]) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function Waiting({
  header,
  text,
  hint,
  steps,
}: {
  header: React.ReactNode;
  text: string;
  hint: string;
  steps: [string, StepState][];
}) {
  return (
    <Screen>
      {header}
      <View style={styles.waiting}>
        <FilmLeader />
        <View style={{ gap: 8 }}>
          <Title style={{ textAlign: 'center' }}>{text}</Title>
          <Body muted style={{ textAlign: 'center' }}>
            {hint}
          </Body>
        </View>
        <Steps steps={steps.map(([label, state]) => ({ label, state }))} />
      </View>
    </Screen>
  );
}

/** Shows the script for approval as a screenplay page. Lines can be tweaked, or the whole script rewritten. */
function ScriptReview({
  video,
  onChange,
  reload,
}: {
  video: VideoDetail;
  onChange: (v: VideoDetail) => void;
  reload: () => Promise<void>;
}) {
  const call = useApi();
  const me = useResource<Me>('/me');
  const [draft, setDraft] = useState<Script>(video.script!);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'approve' | 'regenerate' | null>(null);
  const [torn, setTorn] = useState(false);
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
            "Your video credit is on its way. Tap Roll camera again in a moment; you won't be charged twice.",
          );
          return;
        }
        result = await approveOnce();
      }
      if ('error' in result) throw new Error('approve failed after purchase');
      track('script_approved', { paidWith: result.paidWith });
      // Let the ticket stub tear before the screen moves on to filming.
      setTorn(true);
      await new Promise((r) => setTimeout(r, 700));
      await reload();
    } catch {
      setTorn(false);
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
    ? { price: '', caption: 'Admit one · 15 sec' }
    : !me.data.freeVideoUsed
      ? { price: 'Free', caption: 'Your first video' }
      : me.data.videoCredits > 0
        ? { price: '1 credit', caption: 'Admit one · 15 sec' }
        : { price: storePrice ?? '$4.99', caption: 'Admit one · 15 sec' };

  return (
    <Screen
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          <Ticket
            title="Roll camera"
            price={price.price}
            caption={price.caption}
            onPress={approve}
            busy={busy === 'approve' && !torn}
            disabled={busy !== null}
            torn={torn}
          />
          {video.canRegenerate && (
            <Button
              title="Write a different script"
              kind="quiet"
              onPress={regenerate}
              busy={busy === 'regenerate'}
              disabled={busy !== null}
            />
          )}
        </>
      }
    >
      <Rise>
        <View style={{ gap: 8 }}>
          <Eyebrow>{STYLE_LABELS[video.style].label}</Eyebrow>
          <Title>{draft.title}</Title>
          <Body muted>{draft.premise}</Body>
        </View>
      </Rise>
      <Rise index={1}>
        <ScriptPage>
          {draft.beats.map((b, i) => (
            <View key={`${b.fromSecond}-${b.toSecond}`} style={styles.beat}>
              <Text style={scriptText.timecode}>
                {clock(b.fromSecond)} – {clock(b.toSecond)}
              </Text>
              <Text style={scriptText.action}>{b.action}</Text>
              {(b.line !== '' || b.subtitle !== '') && (
                <>
                  <Text style={scriptText.speaker}>{speaker(b)}</Text>
                  <ScriptInput
                    value={b.subtitle}
                    onChangeText={(t) => edit(i, 'subtitle', t)}
                    label="Subtitle"
                  />
                  <ScriptInput
                    value={b.line}
                    onChangeText={(t) => edit(i, 'line', t)}
                    label="Spoken line"
                    spoken
                  />
                </>
              )}
            </View>
          ))}
        </ScriptPage>
      </Rise>
      <Body small muted style={{ textAlign: 'center' }}>
        Tap a line to change it. The top line is the subtitle; the one in brackets is what the cast
        says.
      </Body>
    </Screen>
  );
}

/** 4 → "0:04". */
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** A line of dialogue you can edit in place, highlighted like a marker while you type. */
function ScriptInput({
  value,
  onChangeText,
  label,
  spoken,
}: {
  value: string;
  onChangeText: (t: string) => void;
  label: string;
  spoken?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.dialogue}>
      {spoken && <Text style={[scriptText.line, styles.spoken]}>(</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline
        scrollEnabled={false}
        accessibilityLabel={label}
        selectionColor={c.ink}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          scriptText.line,
          styles.dialogueInput,
          spoken && styles.spoken,
          focused && { backgroundColor: c.highlight },
        ]}
      />
      {spoken && <Text style={[scriptText.line, styles.spoken]}>)</Text>}
    </View>
  );
}

/** Plays the finished video behind a curtain that opens, and shares the file through the share sheet. */
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
    <Screen
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          <Button title="Send to the group" onPress={share} busy={busy} />
          <Button title="Delete video" kind="danger" onPress={remove} />
        </>
      }
    >
      <View style={{ gap: 6 }}>
        <Eyebrow>Premiere</Eyebrow>
        <Title>{video.title ?? STYLE_LABELS[video.style].label}</Title>
      </View>
      <Curtain>
        <VideoView player={player} style={styles.video} contentFit="contain" nativeControls />
      </Curtain>
    </Screen>
  );
}

const styles = StyleSheet.create({
  waiting: { flex: 1, justifyContent: 'center', gap: 32, paddingVertical: 24 },
  beat: { gap: 4, paddingBottom: 10 },
  dialogue: { flexDirection: 'row', justifyContent: 'center', paddingHorizontal: 18 },
  dialogueInput: { flexShrink: 1, padding: 2, borderRadius: 3, minWidth: 40 },
  spoken: { fontSize: 13, color: c.inkMuted },
  video: { width: '100%', aspectRatio: 9 / 16, borderRadius: radius.lg, backgroundColor: '#000' },
});
