import {
  MAX_SCRIPT_LINE,
  REPORT_REASONS,
  type ApproveResult,
  type Beat,
  type Me,
  type ReportReason,
  type Script,
  type VideoDetail,
} from '@insidejoke/shared';
import { File, Paths } from 'expo-file-system';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import {
  Curtain,
  FilmLeader,
  GenrePoster,
  ScriptPage,
  scriptText,
  Steps,
  Ticket,
  type StepState,
} from '../../components/cinema';
import {
  Body,
  Bulbs,
  Button,
  ErrorText,
  Eyebrow,
  FaceStack,
  Loading,
  Pressy,
  Rise,
  Screen,
  success,
  tick,
  Title,
} from '../../components/ui';
import { track } from '../../lib/analytics';
import { ApiError, LIMIT_MESSAGES, useApi, useResource } from '../../lib/api';
import { buyVideo, videoPrice } from '../../lib/purchases';
import { isInProgress, STATUS_LABELS, STYLE_LABELS } from '../../lib/styles';
import { colors as c, fonts, radius, space, type } from '../../lib/theme';

/** One video from script to share: it shows whatever step the video is at. */
export default function VideoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const video = useResource<VideoDetail>(`/videos/${id}`, {
    pollMs: 4000,
    poll: (v) => isInProgress(v.status),
  });
  // A light tick each time production moves on a step while you watch.
  const status = video.data?.status;
  const lastStatus = useRef(status);
  useEffect(() => {
    // Paying and the premiere have their own celebration, so only the quiet steps tick.
    if (status === 'script_ready' || status === 'generating') {
      if (lastStatus.current && status !== lastStatus.current) tick();
    }
    lastStatus.current = status;
  }, [status]);

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
  const star = names[0];

  switch (v.status) {
    case 'draft':
      return (
        <Waiting
          header={header}
          eyebrow="In the writers' room"
          text="Writing the script"
          hint="This takes about half a minute."
          cast={names}
          captions={WRITING_CAPTIONS}
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
          eyebrow={STATUS_LABELS[v.status].replace('…', '')}
          text={star ? `Lights. Camera. ${star}.` : 'Lights. Camera. Action.'}
          hint="This takes a few minutes. You can leave the app; we'll send you a notification when it premieres."
          cast={names}
          captions={filmingCaptions(names)}
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
            <>
              <Button
                title="Write a new script"
                onPress={() => router.replace(`/groups/${v.groupId}/new-video`)}
              />
              <Button
                title="Back to the group"
                kind="quiet"
                onPress={() => router.replace(`/groups/${v.groupId}`)}
              />
            </>
          }
        >
          {header}
          <View style={styles.cut}>
            <View style={styles.cutPoster}>
              <GenrePoster genre={v.style} title={v.title ?? undefined} height={260} />
              <View style={styles.cutShade} />
              <Text style={styles.cutStamp}>CUT</Text>
            </View>
            <View style={{ gap: 10 }}>
              <Eyebrow>That's a wrap, for now</Eyebrow>
              <Title>We couldn't make this video</Title>
              <Body muted>
                Sometimes the AI turns a scene down, or a cast member removed their selfie. You
                weren't charged: if you paid, the ticket is back on your account for the next video.
              </Body>
            </View>
          </View>
        </Screen>
      );
  }
}

/** "Dani", "Dani and Ziv", "Dani, Ziv and Maya". */
function listNames(names: string[]) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

const WRITING_CAPTIONS = [
  'Reading the chat…',
  'Finding the punchline…',
  'Giving everyone their best line…',
  'Cutting the boring bits…',
];

const filmingCaptions = (names: string[]) => [
  'Setting up the lights…',
  names[0] ? `${names[0]} is in makeup…` : 'The cast is in makeup…',
  names[1] ? `${names[1]} is running lines…` : 'Running lines…',
  'Rolling camera…',
  'Adding the subtitles…',
];

const CAPTION_MS = 5000;

/** The wait between steps: the countdown leader, the cast on set, and what's happening now. */
function Waiting({
  header,
  eyebrow,
  text,
  hint,
  cast,
  captions,
  steps,
}: {
  header: React.ReactNode;
  eyebrow: string;
  text: string;
  hint: string;
  cast: string[];
  captions: string[];
  steps: [string, StepState][];
}) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), CAPTION_MS);
    return () => clearInterval(t);
  }, []);
  const caption = captions[n % captions.length]!;
  return (
    <Screen>
      {header}
      <View style={styles.waiting}>
        <FilmLeader />
        <View style={{ gap: 10, alignItems: 'center' }}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <Title style={{ textAlign: 'center' }}>{text}</Title>
          {cast.length > 0 && <FaceStack names={cast} size={34} />}
          <Animated.Text
            key={caption}
            entering={FadeIn.duration(400)}
            exiting={FadeOut.duration(250)}
            style={styles.caption}
            accessibilityLiveRegion="polite"
          >
            {caption}
          </Animated.Text>
        </View>
        <Steps steps={steps.map(([label, state]) => ({ label, state }))} />
        <Body small muted style={{ textAlign: 'center' }}>
          {hint}
        </Body>
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
  const [notice, setNotice] = useState('');
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
    setNotice('');
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
        let bought;
        try {
          bought = await buyVideo(() => call<Me>('/me'));
        } catch {
          setError("Apple didn't finish the payment, so you weren't charged. Please try again.");
          return;
        }
        if (bought === 'cancelled') return;
        if (bought === 'pending') {
          setNotice(
            "Payment received. Your ticket is on its way: tap Roll camera again in a moment, and you won't be charged twice.",
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
    } catch (e) {
      setTorn(false);
      setError(
        limitMessage(e) ??
          "We couldn't start filming. If you paid, the ticket is saved on your account, so try again.",
      );
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
    } catch (e) {
      setError(limitMessage(e) ?? "We couldn't write a new script.");
    } finally {
      setBusy(null);
    }
  }

  const price = !me.data
    ? { price: '', caption: TICKET_CAPTION }
    : !me.data.freeVideoUsed
      ? { price: 'Free', caption: 'Your first film is on us' }
      : me.data.videoCredits > 0
        ? { price: '1 ticket', caption: TICKET_CAPTION }
        : { price: storePrice ?? '$4.99', caption: TICKET_CAPTION };

  return (
    <Screen
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          {notice !== '' && (
            <Animated.View entering={FadeIn} style={styles.notice}>
              <Bulbs count={3} />
              <Text style={styles.noticeText}>{notice}</Text>
            </Animated.View>
          )}
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
        <View style={styles.hint}>
          <Text style={styles.hintText}>✎ Tap any line to rewrite it</Text>
        </View>
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
        The top line is the subtitle. The one in brackets is what the cast says.
      </Body>
    </Screen>
  );
}

const TICKET_CAPTION = 'Admit one · 15-sec film · yours to keep';

/** 4 → "0:04". */
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** A line of dialogue you can edit in place, highlighted like a marker while you type. */
/** The app's words for a daily cap the API hit, or undefined for any other failure. */
const limitMessage = (e: unknown) =>
  e instanceof ApiError && e.code ? LIMIT_MESSAGES[e.code] : undefined;

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
        maxLength={MAX_SCRIPT_LINE}
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
  // The play link is signed afresh on every load; keep the first so a reload doesn't restart it.
  const [playUrl] = useState(video.playUrl);
  const player = useVideoPlayer(playUrl, (p) => {
    p.loop = true;
    p.play();
  });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
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
      success();
      setSent(true);
    } catch {
      setError("We couldn't share the video. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function report(reason: ReportReason) {
    try {
      await call(`/videos/${video.id}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      Alert.alert(
        'Thanks for telling us',
        'We review every report. You can also delete the video.',
      );
    } catch {
      Alert.alert("We couldn't send your report", 'Please try again.');
    }
  }

  function askReport() {
    const reasons = Object.entries(REPORT_REASONS) as [ReportReason, string][];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Report this video',
        message: 'What is wrong with it?',
        options: [...reasons.map(([, text]) => text), 'Cancel'],
        cancelButtonIndex: reasons.length,
      },
      (i) => {
        const picked = reasons[i];
        if (picked) void report(picked[0]);
      },
    );
  }

  function more() {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Report a problem', 'Delete video', 'Cancel'],
        destructiveButtonIndex: 1,
        cancelButtonIndex: 2,
      },
      (i) => {
        if (i === 0) askReport();
        if (i === 1) remove();
      },
    );
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
          {sent && (
            <Animated.Text entering={FadeIn} style={styles.sent}>
              Sent. Take a bow.
            </Animated.Text>
          )}
          <Button
            title={sent ? 'Send it again' : 'Send to the group'}
            onPress={share}
            busy={busy}
            busyTitle="Preparing your film…"
          />
        </>
      }
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressy
              accessibilityRole="button"
              accessibilityLabel="More options"
              hitSlop={12}
              onPress={more}
            >
              <Text style={styles.more}>•••</Text>
            </Pressy>
          ),
        }}
      />
      <View style={{ gap: 8 }}>
        <Bulbs />
        <Eyebrow>World premiere · {STYLE_LABELS[video.style].label}</Eyebrow>
        <Title>{video.title ?? STYLE_LABELS[video.style].label}</Title>
      </View>
      <Curtain>
        <VideoView player={player} style={styles.video} contentFit="contain" nativeControls />
      </Curtain>
    </Screen>
  );
}

const styles = StyleSheet.create({
  waiting: { flex: 1, justifyContent: 'center', gap: 28, paddingVertical: 24 },
  caption: { ...type.body, color: c.accent, textAlign: 'center', minHeight: 24 },
  cut: { gap: space.xl, marginTop: space.lg },
  cutPoster: { borderRadius: radius.md, overflow: 'hidden' },
  cutShade: { ...StyleSheet.absoluteFill, backgroundColor: '#1a0e16aa' },
  cutStamp: {
    position: 'absolute',
    alignSelf: 'center',
    top: '38%',
    fontFamily: fonts.display,
    fontSize: 56,
    letterSpacing: 4,
    color: c.danger,
    borderWidth: 4,
    borderColor: c.danger,
    borderRadius: 8,
    paddingHorizontal: 16,
    transform: [{ rotate: '-8deg' }],
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: c.card,
    borderRadius: radius.md,
    padding: space.md,
  },
  noticeText: { ...type.small, color: c.text, flex: 1 },
  hint: {
    alignSelf: 'center',
    backgroundColor: c.highlight,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: space.md,
  },
  hintText: { fontFamily: fonts.scriptBold, fontSize: 12, color: c.text },
  sent: { ...type.body, color: c.accent, textAlign: 'center', fontFamily: fonts.displayBold },
  more: { fontFamily: fonts.displayBold, fontSize: 18, color: c.text, letterSpacing: 1 },
  beat: { gap: 4, paddingBottom: 10 },
  dialogue: { flexDirection: 'row', justifyContent: 'center', paddingHorizontal: 18 },
  dialogueInput: { flexShrink: 1, padding: 2, borderRadius: 3, minWidth: 40 },
  spoken: { fontSize: 13, color: c.inkMuted },
  video: { width: '100%', aspectRatio: 9 / 16, borderRadius: radius.lg, backgroundColor: '#000' },
});
