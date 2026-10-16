import type { VideoStyle } from '@insidejoke/shared';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { STYLE_LABELS } from '../lib/styles';
import { colors as c, fonts, GENRE_COLORS, radius, space, type } from '../lib/theme';
import { Pressy, success } from './ui';

/** A genre's poster: its colour as a lit gradient, with a title set in the poster face. */
export function GenrePoster({
  genre,
  title,
  height = 120,
  selected,
  playable,
  compact,
  style,
}: {
  genre: VideoStyle;
  title?: string;
  height?: number;
  selected?: boolean;
  playable?: boolean;
  /** A small square that shows only the title, set large. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const g = GENRE_COLORS[genre];
  return (
    <View
      style={[
        styles.poster,
        { height },
        compact && { justifyContent: 'center' },
        selected && { borderColor: c.text },
        style,
      ]}
    >
      <LinearGradient
        colors={[g.light, g.base, g.deep]}
        locations={[0, 0.45, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* A soft light leak across the top corner, like a projector flare. */}
      <LinearGradient
        colors={['#ffffff55', '#ffffff00']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.4, y: 0.6 }}
        style={StyleSheet.absoluteFill}
      />
      {!compact && (
        <Text style={styles.posterTag}>{STYLE_LABELS[genre].tagline.toUpperCase()}</Text>
      )}
      <Text style={[styles.posterTitle, compact && styles.posterTitleCompact]} numberOfLines={2}>
        {title ?? STYLE_LABELS[genre].label}
      </Text>
      {selected && (
        <Animated.View entering={FadeIn.duration(150)} style={styles.check}>
          <Text style={{ color: c.bg, fontSize: 13, fontWeight: '900' }}>✓</Text>
        </Animated.View>
      )}
      {playable && (
        <View style={styles.play}>
          <View style={styles.playTriangle} />
        </View>
      )}
    </View>
  );
}

/**
 * The buy button: a ticket stub. Payments can drop it in anywhere a video is bought; set `torn`
 * once the purchase goes through and the stub tears off.
 */
export function Ticket({
  title,
  price,
  caption = 'Admit one · 15 sec',
  onPress,
  busy,
  disabled,
  torn,
  notchColor = c.bg,
}: {
  title: string;
  price: string;
  caption?: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  torn?: boolean;
  notchColor?: string;
}) {
  const tear = useSharedValue(0);
  useEffect(() => {
    if (torn) success();
    tear.value = withSpring(torn ? 1 : 0, { damping: 14 });
  }, [torn, tear]);
  const stub = useAnimatedStyle(() => ({
    transform: [
      { translateX: tear.value * 10 },
      { translateY: tear.value * 8 },
      { rotate: `${tear.value * 9}deg` },
    ],
  }));
  return (
    <Pressy
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${price}`}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={[styles.ticketRow, disabled && { opacity: 0.45 }]}
    >
      <View style={[styles.ticketMain, styles.ticketGlow]}>
        <Text style={styles.ticketCaption}>{caption.toUpperCase()}</Text>
        {busy ? (
          <ActivityIndicator color={c.onAccent} style={{ alignSelf: 'flex-start' }} />
        ) : (
          <Text style={styles.ticketTitle}>{title}</Text>
        )}
        <View style={[styles.notch, { left: -9, backgroundColor: notchColor }]} />
      </View>
      <Animated.View style={[styles.ticketStub, stub]}>
        <View style={styles.perforation}>
          {Array.from({ length: 7 }, (_, i) => (
            <View key={i} style={styles.perfDot} />
          ))}
        </View>
        <Text style={styles.ticketPrice}>{price}</Text>
        <View style={[styles.notch, { right: -9, backgroundColor: notchColor }]} />
      </Animated.View>
    </Pressy>
  );
}

const LEADER = 200;

/** The countdown at the head of a film reel: a sweeping hand and a number that counts 8 to 2. */
export function FilmLeader({ size = LEADER }: { size?: number }) {
  const spin = useSharedValue(0);
  const [n, setN] = useState(8);
  useEffect(() => {
    spin.value = withRepeat(withTiming(360, { duration: 1400, easing: Easing.linear }), -1);
    const t = setInterval(() => setN((x) => (x <= 2 ? 8 : x - 1)), 1400);
    return () => clearInterval(t);
  }, [spin]);
  const hand = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.leader, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <View style={[styles.leaderLine, { width: 1.5, height: size }]} />
      <View style={[styles.leaderLine, { height: 1.5, width: size }]} />
      <View style={[styles.leaderRing, { inset: size * 0.08, borderRadius: size }]} />
      <Animated.View style={[StyleSheet.absoluteFill, hand]}>
        <View style={[styles.leaderHand, { height: size / 2, left: size / 2 - 1 }]} />
      </Animated.View>
      <Animated.Text
        key={n}
        entering={FadeIn.duration(120)}
        exiting={FadeOut.duration(120)}
        style={[styles.leaderNumber, { fontSize: size * 0.46 }]}
      >
        {n}
      </Animated.Text>
    </View>
  );
}

export type StepState = 'done' | 'now' | 'later';

/** A short checklist of the production steps, ticking off as the video is made. */
export function Steps({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <View style={{ gap: space.md }}>
      {steps.map((s) => (
        <View key={s.label} style={styles.step}>
          <View
            style={[
              styles.stepDot,
              s.state === 'done' && { backgroundColor: c.accent, borderColor: c.accent },
              s.state === 'now' && { borderColor: c.accent },
            ]}
          >
            {s.state === 'done' && <Text style={styles.stepCheck}>✓</Text>}
            {s.state === 'now' && <PulseDot />}
          </View>
          <Text style={[type.body, { color: s.state === 'later' ? c.faint : c.text }]}>
            {s.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function PulseDot() {
  const s = useSharedValue(0.4);
  useEffect(() => {
    s.value = withRepeat(withTiming(1, { duration: 650 }), -1, true);
  }, [s]);
  const anim = useAnimatedStyle(() => ({ opacity: s.value, transform: [{ scale: s.value }] }));
  return <Animated.View style={[styles.pulse, anim]} />;
}

/** A screenplay page on a stack of paper. Children are set in the typewriter face. */
export function ScriptPage({ children }: { children: ReactNode }) {
  return (
    <View>
      <View style={[styles.sheet, styles.sheetBehind]} />
      <View style={[styles.sheet, styles.sheetShadow]}>{children}</View>
    </View>
  );
}

export const scriptText = StyleSheet.create({
  timecode: { fontFamily: fonts.script, fontSize: 12, color: c.inkMuted },
  action: { fontFamily: fonts.script, fontSize: 15, lineHeight: 21, color: c.ink },
  speaker: {
    fontFamily: fonts.scriptBold,
    fontSize: 15,
    color: c.ink,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginTop: space.sm,
  },
  line: {
    fontFamily: fonts.script,
    fontSize: 15,
    lineHeight: 21,
    color: c.ink,
    textAlign: 'center',
  },
});

/** Two velvet panels that part to reveal the finished video, with a success haptic. */
export function Curtain({ children }: { children: ReactNode }) {
  const open = useSharedValue(0);
  const width = useSharedValue(0);
  useEffect(() => {
    open.value = withDelay(250, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
    const t = setTimeout(success, 500);
    return () => clearTimeout(t);
  }, [open]);
  // Each panel is half the frame wide and slides its own width out of view.
  const left = useAnimatedStyle(() => ({
    transform: [{ translateX: (-open.value * width.value) / 2 }],
  }));
  const right = useAnimatedStyle(() => ({
    transform: [{ translateX: (open.value * width.value) / 2 }],
  }));
  return (
    <View style={styles.curtainFrame} onLayout={(e) => (width.value = e.nativeEvent.layout.width)}>
      {children}
      <Animated.View pointerEvents="none" style={[styles.curtain, { left: 0 }, left]}>
        <LinearGradient
          colors={['#5b0b2a', '#8f1d42', '#5b0b2a', '#8f1d42', '#5b0b2a']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.curtain, { right: 0 }, right]}>
        <LinearGradient
          colors={['#8f1d42', '#5b0b2a', '#8f1d42', '#5b0b2a', '#8f1d42']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  poster: {
    borderRadius: radius.md,
    overflow: 'hidden',
    padding: space.md,
    justifyContent: 'space-between',
    borderWidth: 2.5,
    borderColor: 'transparent',
  },
  posterTag: { fontFamily: fonts.scriptBold, fontSize: 10, letterSpacing: 1.4, color: '#1a0e16aa' },
  posterTitle: {
    fontFamily: fonts.display,
    fontSize: 18,
    lineHeight: 19,
    letterSpacing: -0.4,
    color: c.bg,
  },
  posterTitleCompact: { fontSize: 36, lineHeight: 40, textAlign: 'center' },
  check: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: c.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: c.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTriangle: {
    marginLeft: 3,
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 10,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: c.text,
  },
  ticketRow: { flexDirection: 'row', minHeight: 68 },
  ticketGlow: {
    shadowColor: c.accent,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  ticketMain: {
    flex: 1,
    backgroundColor: c.accent,
    borderTopLeftRadius: radius.md,
    borderBottomLeftRadius: radius.md,
    paddingHorizontal: 20,
    paddingVertical: 12,
    justifyContent: 'center',
    gap: 2,
  },
  ticketCaption: {
    fontFamily: fonts.scriptBold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: '#2a1405bb',
  },
  ticketTitle: { fontFamily: fonts.display, fontSize: 19, letterSpacing: -0.3, color: c.onAccent },
  ticketStub: {
    backgroundColor: c.accent,
    borderTopRightRadius: radius.md,
    borderBottomRightRadius: radius.md,
    paddingLeft: 18,
    paddingRight: 20,
    justifyContent: 'center',
  },
  ticketPrice: { fontFamily: fonts.display, fontSize: 21, color: c.onAccent },
  perforation: {
    position: 'absolute',
    left: -2,
    top: 8,
    bottom: 8,
    justifyContent: 'space-between',
  },
  perfDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#2a140566' },
  notch: {
    position: 'absolute',
    top: '50%',
    marginTop: -9,
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  leader: {
    alignSelf: 'center',
    borderWidth: 2,
    borderColor: c.text,
    backgroundColor: '#fff3e20d',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  leaderLine: { position: 'absolute', backgroundColor: '#fff3e244' },
  leaderRing: { position: 'absolute', borderWidth: 1.5, borderColor: '#fff3e244' },
  leaderHand: { position: 'absolute', top: 0, width: 2, backgroundColor: c.accent },
  leaderNumber: { fontFamily: fonts.display, color: c.text, position: 'absolute' },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCheck: { color: c.onAccent, fontSize: 12, fontWeight: '900' },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent },
  sheet: { backgroundColor: c.paper, borderRadius: 4, paddingHorizontal: 22, paddingVertical: 26 },
  sheetBehind: {
    position: 'absolute',
    top: 6,
    left: 4,
    right: -2,
    bottom: -6,
    backgroundColor: '#e9dcc6',
    transform: [{ rotate: '1.4deg' }],
  },
  sheetShadow: {
    gap: space.sm,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
  },
  curtainFrame: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  curtain: { position: 'absolute', top: 0, bottom: 0, width: '50%' },
});
