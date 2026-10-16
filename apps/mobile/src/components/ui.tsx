import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors as c, fonts, personColor, radius, space, type } from '../lib/theme';

export const tap = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
export const tick = () => void Haptics.selectionAsync();
export const success = () =>
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

/**
 * The page. Content scrolls; `footer` stays pinned above the home indicator, which is where every
 * screen's main action lives.
 */
export function Screen({
  children,
  footer,
  scroll = true,
}: {
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
}) {
  const body = <View style={styles.body}>{children}</View>;
  // Lift the pinned footer above the keyboard; otherwise keep clear of the home indicator.
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard();
  const lift = useAnimatedStyle(() => ({
    paddingBottom: Math.max(keyboard.height.value, insets.bottom),
  }));
  return (
    <Animated.View style={[styles.screen, lift]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
      {footer && (
        <View style={styles.footer}>
          <LinearGradient
            pointerEvents="none"
            colors={[`${c.bg}00`, c.bg]}
            style={styles.footerFade}
          />
          {footer}
        </View>
      )}
    </Animated.View>
  );
}

/** Rises into place on first render. Pass `index` to stagger a list. */
export function Rise({ children, index = 0 }: { children: ReactNode; index?: number }) {
  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 45)
        .springify()
        .damping(18)}
    >
      {children}
    </Animated.View>
  );
}

/** A pressable that sinks a little on a spring and taps the haptic engine. */
export function Pressy({
  children,
  style,
  haptic = 'tap',
  ...props
}: PressableProps & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  haptic?: 'tap' | 'tick' | 'none';
}) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      {...props}
      onPressIn={(e) => {
        scale.value = withSpring(0.96, { damping: 15, stiffness: 400 });
        if (haptic === 'tap') tap();
        if (haptic === 'tick') tick();
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 12, stiffness: 300 });
        props.onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, anim]}>{children}</Animated.View>
    </Pressable>
  );
}

export function Title({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[type.title, { color: c.text }, style]}>{children}</Text>;
}

export function Heading({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[type.heading, { color: c.text }, style]}>{children}</Text>;
}

/** A small typewriter label above a section, like a slate on a film set. */
export function Eyebrow({ children, color = c.accent }: { children: ReactNode; color?: string }) {
  return <Text style={[type.eyebrow, { color, textTransform: 'uppercase' }]}>{children}</Text>;
}

export function Body({
  children,
  muted,
  small,
  style,
}: {
  children: ReactNode;
  muted?: boolean;
  small?: boolean;
  style?: TextStyle;
}) {
  return (
    <Text style={[small ? type.small : type.body, { color: muted ? c.muted : c.text }, style]}>
      {children}
    </Text>
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
  kind?: 'primary' | 'secondary' | 'quiet' | 'danger';
  disabled?: boolean;
  busy?: boolean;
}) {
  const primary = kind === 'primary';
  const fg = primary ? c.onAccent : kind === 'danger' ? c.danger : c.text;
  return (
    <Pressy
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      onPress={onPress}
      disabled={disabled || busy}
      haptic={disabled ? 'none' : 'tap'}
      style={[
        styles.button,
        primary && styles.buttonPrimary,
        kind === 'secondary' && styles.buttonSecondary,
        disabled && (primary ? styles.buttonPrimaryOff : { opacity: 0.4 }),
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text
          style={[
            type.button,
            { color: disabled && primary ? c.faint : fg },
            (kind === 'quiet' || kind === 'danger') && styles.quietText,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressy>
  );
}

export function Field({
  label,
  hint,
  ...props
}: TextInputProps & { label: string; hint?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space.sm }}>
      <Eyebrow color={c.muted}>{label}</Eyebrow>
      <TextInput
        placeholderTextColor={c.faint}
        selectionColor={c.accent}
        keyboardAppearance="dark"
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          styles.input,
          { borderColor: focused ? c.accent : 'transparent' },
          props.multiline && { minHeight: 180, textAlignVertical: 'top' },
          props.style,
        ]}
      />
      {hint ? (
        <Body small muted>
          {hint}
        </Body>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressy accessibilityRole="button" onPress={onPress} style={[styles.card, style]}>
      {children}
    </Pressy>
  );
}

/** A small status label. `live` adds a blinking bulb for work that is still happening. */
export function Pill({ label, live }: { label: string; live?: boolean }) {
  return (
    <View style={styles.pill}>
      {live && <Bulb size={6} />}
      <Text style={[styles.pillText, live && { color: c.accent }]}>{label}</Text>
    </View>
  );
}

/** One marquee bulb that breathes. */
export function Bulb({ size = 9, delay = 0 }: { size?: number; delay?: number }) {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(0.3, { duration: 700 }), withTiming(1, { duration: 700 })),
        -1,
      ),
    );
  }, [o, delay]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: c.accent },
        styles.glow,
        anim,
      ]}
    />
  );
}

export function Bulbs({ count = 8 }: { count?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }} accessibilityElementsHidden>
      {Array.from({ length: count }, (_, i) => (
        <Bulb key={i} delay={(i % 3) * 350} />
      ))}
    </View>
  );
}

/** A person's photo, or their initial on a colour picked from their name. */
export function Avatar({
  name,
  uri,
  size = 44,
  ring,
  dim,
}: {
  name: string;
  uri?: string | null;
  size?: number;
  ring?: boolean;
  dim?: boolean;
}) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: personColor(name),
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          opacity: dim ? 0.35 : 1,
        },
        ring && { borderWidth: 3, borderColor: c.accent },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} />
      ) : (
        <Text style={{ fontFamily: fonts.display, fontSize: size * 0.42, color: c.bg }}>
          {name.trim().charAt(0).toUpperCase() || '?'}
        </Text>
      )}
    </View>
  );
}

/** Overlapping faces, like a cast list on a poster. */
export function FaceStack({ names, size = 28 }: { names: string[]; size?: number }) {
  const shown = names.slice(0, 4);
  return (
    <View style={{ flexDirection: 'row' }}>
      {shown.map((n, i) => (
        <View
          key={`${n}-${i}`}
          style={{
            marginLeft: i === 0 ? 0 : -size * 0.28,
            borderRadius: size,
            borderWidth: 2,
            borderColor: c.card,
          }}
        >
          <Avatar name={n} size={size} />
        </View>
      ))}
      {names.length > shown.length && (
        <Text style={[type.small, { color: c.muted, marginLeft: 6, alignSelf: 'center' }]}>
          +{names.length - shown.length}
        </Text>
      )}
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <Bulbs count={3} />
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? (
    <Animated.Text entering={FadeInDown} style={[type.small, { color: c.danger }]}>
      {children}
    </Animated.Text>
  ) : null;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: space.sm, paddingBottom: space.xl, gap: 18 },
  footer: { paddingHorizontal: 20, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm },
  footerFade: { position: 'absolute', left: 0, right: 0, top: -28, height: 28 },
  button: {
    minHeight: 56,
    borderRadius: radius.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonPrimary: {
    backgroundColor: c.accent,
    shadowColor: c.accent,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  buttonPrimaryOff: { backgroundColor: c.raised, shadowOpacity: 0 },
  buttonSecondary: { borderWidth: 1, borderColor: c.border },
  quietText: { fontFamily: fonts.displayBold, fontSize: 16 },
  input: {
    backgroundColor: c.raised,
    color: c.text,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 17,
  },
  card: { backgroundColor: c.card, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: c.raised,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: { fontSize: 12, fontWeight: '700', color: c.muted },
  glow: {
    shadowColor: c.accent,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
});
