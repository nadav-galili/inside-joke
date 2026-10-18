import {
  MAX_CAST,
  MAX_INPUT_CHARS,
  MIN_CAST,
  VIDEO_STYLES,
  type GroupDetail,
  type VideoStyle,
} from '@insidejoke/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { GenrePoster } from '../../../components/cinema';
import {
  Avatar,
  Button,
  ErrorText,
  Eyebrow,
  Field,
  Loading,
  Pressy,
  Rise,
  Screen,
  Title,
} from '../../../components/ui';
import { track } from '../../../lib/analytics';
import { ApiError, LIMIT_MESSAGES, useApi, useResource } from '../../../lib/api';
import { STYLE_LABELS } from '../../../lib/styles';
import { colors as c, type } from '../../../lib/theme';

/** Paste the chat moment, pick a genre and the cast. The script is written next, before paying. */
export default function NewVideo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const call = useApi();
  const group = useResource<GroupDetail>(`/groups/${id}`);
  const [text, setText] = useState('');
  const [style, setStyle] = useState<VideoStyle | null>(null);
  const [cast, setCast] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!group.data) return <Loading />;
  const castable = group.data.members.filter((m) => m.hasFace);

  function toggle(memberId: string) {
    setCast((now) =>
      now.includes(memberId)
        ? now.filter((m) => m !== memberId)
        : now.length < MAX_CAST
          ? [...now, memberId]
          : now,
    );
  }

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const video = await call<{ id: string }>('/videos', {
        method: 'POST',
        body: JSON.stringify({ groupId: id, inputText: text, style, castMemberIds: cast }),
      });
      track('video_started', { style: style!, cast: cast.length });
      router.replace(`/videos/${video.id}`);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      setError(
        code === 'cast_without_consent'
          ? 'Someone in the cast removed their selfie. Pick the cast again.'
          : (LIMIT_MESSAGES[code ?? ''] ?? "We couldn't start the video. Please try again."),
      );
      setBusy(false);
    }
  }

  // The button says what's still missing instead of just greying out.
  const missing =
    text.trim().length === 0
      ? 'Paste the moment first'
      : style === null
        ? 'Pick a genre'
        : castable.length < MIN_CAST
          ? 'Invite more friends to cast'
          : cast.length < MIN_CAST
            ? `Pick ${MIN_CAST - cast.length} more for the cast`
            : null;
  const nearLimit = text.length > MAX_INPUT_CHARS * 0.8;
  return (
    <Screen
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          <Button
            title={missing ?? 'Write the script'}
            onPress={submit}
            busy={busy}
            busyTitle="Calling the writers…"
            disabled={missing !== null}
            testID="write-script"
          />
        </>
      }
    >
      <Rise>
        <View style={{ gap: 10 }}>
          <Eyebrow>New video</Eyebrow>
          <Title>What happened?</Title>
        </View>
      </Rise>
      <Rise index={1}>
        <Field
          label="The moment"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={MAX_INPUT_CHARS}
          placeholder="Paste the messages from your group chat, or describe the inside joke."
          testID="moment"
          hint={
            nearLimit
              ? `${text.length} of ${MAX_INPUT_CHARS} characters. We delete this text once you approve the script.`
              : 'We delete this text once you approve the script.'
          }
        />
      </Rise>

      <Rise index={2}>
        <View style={styles.section}>
          <Eyebrow color={c.muted}>Genre</Eyebrow>
          <View style={styles.grid}>
            {VIDEO_STYLES.map((s) => (
              <Pressy
                key={s}
                accessibilityRole="radio"
                accessibilityLabel={STYLE_LABELS[s].label}
                accessibilityState={{ selected: style === s }}
                haptic="tick"
                onPress={() => setStyle(s)}
                testID={`genre-${s}`}
                style={styles.genre}
              >
                <GenrePoster genre={s} height={112} selected={style === s} />
              </Pressy>
            ))}
          </View>
        </View>
      </Rise>

      <Rise index={3}>
        <View style={styles.section}>
          <Eyebrow color={c.muted}>
            Cast · {MIN_CAST} to {MAX_CAST}
          </Eyebrow>
          <View style={styles.cast}>
            {castable.map((m) => {
              const on = cast.includes(m.id);
              return (
                <Pressy
                  key={m.id}
                  accessibilityRole="checkbox"
                  accessibilityLabel={m.displayName}
                  accessibilityState={{ checked: on }}
                  haptic="tick"
                  onPress={() => toggle(m.id)}
                  testID={`cast-${m.displayName}`}
                  style={styles.person}
                >
                  <Avatar name={m.displayName} size={58} ring={on} dim={!on} />
                  <Text
                    numberOfLines={1}
                    style={[type.small, { color: on ? c.text : c.muted, fontWeight: '600' }]}
                  >
                    {m.displayName}
                  </Text>
                </Pressy>
              );
            })}
          </View>
        </View>
      </Rise>
    </Screen>
  );
}

const GENRE = (Dimensions.get('window').width - 40 - 10) / 2;

const styles = StyleSheet.create({
  section: { gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  genre: { width: GENRE },
  cast: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  person: { width: 66, alignItems: 'center', gap: 6 },
});
