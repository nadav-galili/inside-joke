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
import { ApiError, useApi, useResource } from '../../../lib/api';
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
      router.replace(`/videos/${video.id}`);
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'cast_without_consent'
          ? 'Someone in the cast removed their selfie. Pick the cast again.'
          : "We couldn't start the video. Please try again.",
      );
      setBusy(false);
    }
  }

  const ready = text.trim().length > 0 && style !== null && cast.length >= MIN_CAST;
  return (
    <Screen
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          <Button title="Write the script" onPress={submit} busy={busy} disabled={!ready} />
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
          hint={`${text.length}/${MAX_INPUT_CHARS}. We delete this text once you approve the script.`}
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
