import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '../lib/theme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const c = useColors();
  const body = <View style={styles.body}>{children}</View>;
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={[styles.title, { color: c.text }]}>{children}</Text>;
}

export function Body({
  children,
  muted,
  style,
}: {
  children: ReactNode;
  muted?: boolean;
  style?: TextStyle;
}) {
  const c = useColors();
  return (
    <Text style={[styles.body16, { color: muted ? c.muted : c.text }, style]}>{children}</Text>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  busy,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
}) {
  const c = useColors();
  const bg = kind === 'primary' ? c.accent : 'transparent';
  const fg = kind === 'primary' ? c.onAccent : kind === 'danger' ? c.danger : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: kind === 'primary' ? bg : c.border },
        (pressed || disabled) && { opacity: 0.5 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: c.text }]}>{label}</Text>
      <TextInput
        placeholderTextColor={c.muted}
        {...props}
        style={[
          styles.input,
          { color: c.text, borderColor: c.border, backgroundColor: c.card },
          props.multiline && { minHeight: 160, textAlignVertical: 'top' },
          props.style,
        ]}
      />
    </View>
  );
}

export function Card({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: c.card },
        pressed && { opacity: 0.7 },
      ]}
    >
      {children}
    </Pressable>
  );
}

export function Loading() {
  const c = useColors();
  return (
    <View style={[styles.center, { backgroundColor: c.bg }]}>
      <ActivityIndicator color={c.accent} />
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  const c = useColors();
  return children ? <Text style={{ color: c.danger, fontSize: 15 }}>{children}</Text> : null;
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: 20, gap: 16 },
  title: { fontSize: 28, fontWeight: '800' },
  body16: { fontSize: 16, lineHeight: 22 },
  button: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonText: { fontSize: 17, fontWeight: '700' },
  label: { fontSize: 15, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 17 },
  card: { borderRadius: 16, padding: 16, gap: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
