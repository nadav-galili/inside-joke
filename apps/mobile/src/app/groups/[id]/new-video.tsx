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
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, ErrorText, Field, Loading, Screen } from '../../../components/ui';
import { track } from '../../../lib/analytics';
import { ApiError, useApi, useResource } from '../../../lib/api';
import { STYLE_LABELS } from '../../../lib/styles';
import { useColors, type Colors } from '../../../lib/theme';

function Chip({
  label,
  selected,
  onPress,
  c,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  c: Colors;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? c.accent : c.border,
          backgroundColor: selected ? c.accent : c.card,
        },
      ]}
    >
      <Text style={{ color: selected ? c.onAccent : c.text, fontSize: 16, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Paste the chat moment, pick a genre and the cast. The script is written next, before paying. */
export default function NewVideo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
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
    <Screen>
      <Field
        label="The moment"
        value={text}
        onChangeText={setText}
        multiline
        maxLength={MAX_INPUT_CHARS}
        placeholder="Paste the messages from your group chat, or describe the inside joke."
      />
      <Body muted>
        {text.length}/{MAX_INPUT_CHARS}. We delete this text once you approve the script.
      </Body>

      <Text style={[styles.heading, { color: c.text }]}>Style</Text>
      <View style={styles.wrap}>
        {VIDEO_STYLES.map((s) => (
          <Chip
            key={s}
            c={c}
            label={`${STYLE_LABELS[s].emoji} ${STYLE_LABELS[s].label}`}
            selected={style === s}
            onPress={() => setStyle(s)}
          />
        ))}
      </View>

      <Text style={[styles.heading, { color: c.text }]}>
        Cast ({MIN_CAST} to {MAX_CAST})
      </Text>
      <View style={styles.wrap}>
        {castable.map((m) => (
          <Chip
            key={m.id}
            c={c}
            label={m.displayName}
            selected={cast.includes(m.id)}
            onPress={() => toggle(m.id)}
          />
        ))}
      </View>

      <Button title="Write the script" onPress={submit} busy={busy} disabled={!ready} />
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 18, fontWeight: '800', marginTop: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
});
