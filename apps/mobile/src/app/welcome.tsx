import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState, type ComponentType } from 'react';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeInUp,
  FadeOut,
  interpolate,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  ZoomIn,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import icon from '../../assets/icon.png';
import wordmark from '../../assets/wordmark.png';
import { GenrePoster, ScriptPage, scriptText } from '../components/cinema';
import { Avatar, Body, Button, Eyebrow, Pill, Title } from '../components/ui';
import { track } from '../lib/analytics';
import { SAMPLES } from '../lib/samples';
import { STYLE_LABELS } from '../lib/styles';
import { colors as c, fonts, GENRE_COLORS, radius, space, type } from '../lib/theme';

type Stage = ComponentType<{ active: boolean; height: number }>;

/**
 * What a new user sees before signing in: sample videos, then how a video gets made. Sign-in comes
 * at the end, or straight away for someone who already has an account.
 */
export default function Welcome() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pager = useAnimatedRef<Animated.ScrollView>();
  const x = useSharedValue(0);
  const [page, setPage] = useState(0);
  const [stageHeight, setStageHeight] = useState(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    x.value = e.contentOffset.x;
  });
  const last = page === PAGES.length - 1;

  function finish(skipped: boolean) {
    track('welcome_finished', { skipped, page: page + 1 });
    router.push('/sign-in');
  }

  function next() {
    if (last) return finish(false);
    pager.current?.scrollTo({ x: width * (page + 1), animated: true });
    setPage(page + 1);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.top}>
        <Image source={wordmark} accessibilityLabel="Inside Joke" style={styles.wordmark} />
        <Pressable accessibilityRole="button" hitSlop={12} onPress={() => finish(true)}>
          <Text style={styles.signIn}>Sign in</Text>
        </Pressable>
      </View>
      <Animated.ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {PAGES.map((p, i) => (
          <View key={p.title} style={[styles.page, { width }]}>
            <View
              style={styles.stage}
              onLayout={i === 0 ? (e) => setStageHeight(e.nativeEvent.layout.height) : undefined}
            >
              {stageHeight > 0 && <p.Stage active={page === i} height={stageHeight} />}
            </View>
            <View style={styles.copy}>
              <Eyebrow>{p.eyebrow}</Eyebrow>
              <Title>{p.title}</Title>
              <Body muted>{p.body}</Body>
            </View>
          </View>
        ))}
      </Animated.ScrollView>
      <View style={styles.footer}>
        <View style={styles.dots} accessibilityLabel={`Page ${page + 1} of ${PAGES.length}`}>
          {PAGES.map((p, i) => (
            <Dot key={p.title} index={i} x={x} width={width} />
          ))}
        </View>
        <Button title={last ? 'Get started' : 'Next'} onPress={next} />
      </View>
    </View>
  );
}

/** A page marker that stretches into a bar while its page is on screen. */
function Dot({ index, x, width }: { index: number; x: SharedValue<number>; width: number }) {
  const style = useAnimatedStyle(() => {
    const d = Math.abs(x.value / width - index);
    return {
      width: interpolate(d, [0, 1], [22, 7], Extrapolation.CLAMP),
      opacity: interpolate(d, [0, 1], [1, 0.3], Extrapolation.CLAMP),
    };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

/** Counts up from 0 every `ms` while the page is on screen, and starts over when it comes back. */
function useBeat(active: boolean, ms: number, max: number) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (!active) return;
    const t = setInterval(() => setN((v) => (v >= max ? v : v + 1)), ms);
    return () => clearInterval(t);
  }, [active, ms, max]);
  return n;
}

// Page 1: the samples, shown the way a finished video looks on a phone.

const SAMPLE_MS = 2800;
const CLIP_MS = 6000;

const SampleReel: Stage = ({ active, height }) => {
  const [i, setI] = useState(0);
  const sample = SAMPLES[i]!;
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setI((v) => (v + 1) % SAMPLES.length), duration(sample));
    return () => clearTimeout(t);
  }, [active, i, sample]);

  const frameH = Math.min(height - space.lg, 400);
  const frameW = (frameH * 9) / 16;
  const behind = [SAMPLES[(i + 1) % SAMPLES.length]!, SAMPLES[(i + 2) % SAMPLES.length]!];
  return (
    <View style={styles.center} accessibilityElementsHidden>
      {behind.map((s, k) => (
        <GenrePoster
          key={s.title}
          genre={s.genre}
          title={s.title}
          height={frameH * 0.8}
          style={[
            styles.behind,
            {
              width: frameW * 0.8,
              transform: [
                { translateX: (k === 0 ? -1 : 1) * frameW * 0.42 },
                { rotate: k === 0 ? '-8deg' : '8deg' },
              ],
            },
          ]}
        />
      ))}
      <View style={[styles.frame, { width: frameW, height: frameH }]}>
        <Animated.View
          key={sample.title}
          entering={FadeIn.duration(450)}
          exiting={FadeOut.duration(450)}
          style={StyleSheet.absoluteFill}
        >
          {sample.clip ? <Clip source={sample.clip} /> : <SampleCard sample={sample} />}
        </Animated.View>
        <View style={styles.progress}>
          {SAMPLES.map((s, k) => (
            <View key={s.title} style={styles.progressTrack}>
              {k < i && <View style={[styles.progressFill, { width: '100%' }]} />}
              {k === i && <Fill running={active} ms={duration(s)} />}
            </View>
          ))}
        </View>
        <View style={styles.mark}>
          <Image source={icon} style={styles.markIcon} />
          <Text style={styles.markText}>Inside Joke</Text>
        </View>
      </View>
    </View>
  );
};

const duration = (s: (typeof SAMPLES)[number]) => (s.clip ? CLIP_MS : SAMPLE_MS);

/** The bar that fills while the current sample plays. */
function Fill({ running, ms }: { running: boolean; ms: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = 0;
    if (running) p.value = withTiming(1, { duration: ms, easing: Easing.linear });
  }, [running, ms, p]);
  const style = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  return <Animated.View style={[styles.progressFill, style]} />;
}

/** A sample without a clip: its genre's poster colours, slowly pushing in, with a subtitle. */
function SampleCard({ sample }: { sample: (typeof SAMPLES)[number] }) {
  const g = GENRE_COLORS[sample.genre];
  const still = useReducedMotion();
  const zoom = useSharedValue(1);
  useEffect(() => {
    if (!still) zoom.value = withTiming(1.14, { duration: SAMPLE_MS + 900 });
  }, [still, zoom]);
  const push = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }));
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, push]}>
        <LinearGradient
          colors={[g.light, g.base, g.deep]}
          locations={[0, 0.5, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['#ffffff66', '#ffffff00']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.3, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTag}>{STYLE_LABELS[sample.genre].label.toUpperCase()}</Text>
        <Text style={styles.cardTitle}>{sample.title}</Text>
      </View>
      <LinearGradient colors={['#00000000', '#00000099']} style={styles.subtitleShade} />
      <Text style={styles.subtitle}>{sample.subtitle}</Text>
    </View>
  );
}

function Clip({ source }: { source: number }) {
  const player = useVideoPlayer(source, (p) => {
    p.muted = true;
    p.loop = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

// Page 2: the moment in the group chat.

const CHAT = [
  { name: 'Ziv', text: 'who ate my hummus' },
  { name: 'Dani', text: 'define ate' },
  { name: 'Maya', text: "dani there's a spoon in your bag" },
  { name: 'Dani', text: 'i was holding it for a friend' },
];
const PUNCHLINE = CHAT.length - 1;

const ChatMoment: Stage = ({ active }) => {
  const shown = useBeat(active, 700, CHAT.length + 1);
  const picked = shown > CHAT.length;
  return (
    <View style={styles.chat} accessibilityElementsHidden>
      {CHAT.slice(0, shown).map((m, i) => (
        <Animated.View
          key={i}
          entering={FadeInUp.springify().damping(16)}
          style={[styles.message, i === PUNCHLINE && picked && styles.messagePicked]}
        >
          <Avatar name={m.name} size={30} />
          <View style={[styles.bubble, i === PUNCHLINE && picked && styles.bubblePicked]}>
            <Text style={styles.bubbleName}>{m.name}</Text>
            <Text style={styles.bubbleText}>{m.text}</Text>
          </View>
        </Animated.View>
      ))}
      {picked && (
        <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.thisOne}>
          <Text style={styles.thisOneText}>THAT'S THE ONE</Text>
        </Animated.View>
      )}
    </View>
  );
};

// Page 3: the cast, each friend lighting up as they add their own selfie.

const CAST = ['You', 'Ziv', 'Dani', 'Maya'];

const CastCall: Stage = ({ active }) => {
  const joined = useBeat(active, 650, CAST.length);
  return (
    <View style={styles.center} accessibilityElementsHidden>
      <View style={styles.castCard}>
        <Eyebrow color={c.muted}>Starring</Eyebrow>
        <View style={styles.castRow}>
          {CAST.map((name, i) => (
            <View key={name} style={styles.castMember}>
              <View>
                <Avatar name={name} size={58} ring={i < joined} dim={i >= joined} />
                {i < joined && (
                  <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.joined}>
                    <Text style={styles.joinedMark}>✓</Text>
                  </Animated.View>
                )}
              </View>
              <Text style={[type.small, { color: i < joined ? c.text : c.faint }]}>{name}</Text>
            </View>
          ))}
        </View>
        <Pill label={joined >= CAST.length ? 'Full cast' : 'Invite link shared'} live />
      </View>
    </View>
  );
};

// Page 4: pick a genre, and the script appears.

const GENRES = ['telenovela', 'action_trailer_80s', 'nature_documentary', 'sports_commentary'] as const;

const GenrePick: Stage = ({ active, height }) => {
  const beat = useBeat(active, 700, 2);
  const posterH = Math.max(64, Math.min(104, (height - 170) / 2));
  return (
    <View style={styles.pick} accessibilityElementsHidden>
      <View style={styles.grid}>
        {GENRES.map((g) => (
          <GenrePoster
            key={g}
            genre={g}
            height={posterH}
            selected={beat >= 1 && g === 'telenovela'}
            style={styles.gridPoster}
          />
        ))}
      </View>
      {beat >= 2 && (
        <Animated.View entering={FadeInUp.springify().damping(16)} style={styles.script}>
          <ScriptPage>
            <Text style={scriptText.action}>Dani clutches a spoon. Thunder.</Text>
            <Text style={scriptText.speaker}>Dani</Text>
            <Text style={scriptText.line}>I was holding it for a friend.</Text>
          </ScriptPage>
        </Animated.View>
      )}
    </View>
  );
};

const PAGES: { eyebrow: string; title: string; body: string; Stage: Stage }[] = [
  {
    eyebrow: 'Now showing',
    title: 'Your group chat, on the big screen',
    body: "Turn the chat's funniest moment into a 15-second film starring your friends.",
    Stage: SampleReel,
  },
  {
    eyebrow: 'Scene one',
    title: 'It starts with a moment',
    body: 'Paste the bit of the chat everyone still laughs about.',
    Stage: ChatMoment,
  },
  {
    eyebrow: 'The cast',
    title: 'Everyone plays themselves',
    body: 'Friends join from your invite link and add their own selfie. Only you can add your face.',
    Stage: CastCall,
  },
  {
    eyebrow: 'Action',
    title: 'Pick a genre, approve the script',
    body: 'We write the scene, you tweak the lines, then we film it. Your first video is free.',
    Stage: GenrePick,
  },
];

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  top: {
    height: 48,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: { width: 104, height: 104 * (172 / 524) },
  signIn: { ...type.small, fontFamily: fonts.displayBold, fontSize: 15, color: c.text },
  page: { flex: 1, paddingHorizontal: 20 },
  stage: { flex: 1, justifyContent: 'center' },
  copy: { gap: 10, paddingTop: space.md, paddingBottom: space.sm, minHeight: 168 },
  footer: { paddingHorizontal: 20, paddingTop: space.sm, paddingBottom: space.sm, gap: space.lg },
  dots: { flexDirection: 'row', gap: 6, alignSelf: 'center' },
  dot: { height: 7, borderRadius: 4, backgroundColor: c.accent },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  behind: { position: 'absolute', opacity: 0.45 },
  frame: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  progress: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', gap: 4 },
  progressTrack: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: '#ffffff44',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#ffffff' },
  mark: {
    position: 'absolute',
    top: 22,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    opacity: 0.92,
  },
  markIcon: { width: 16, height: 16, borderRadius: 4 },
  markText: { fontFamily: fonts.display, fontSize: 11, color: '#ffffff' },
  cardBody: { position: 'absolute', left: 18, right: 18, top: '28%', gap: 8 },
  cardTag: { fontFamily: fonts.scriptBold, fontSize: 11, letterSpacing: 1.4, color: '#1a0e16aa' },
  cardTitle: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 31,
    letterSpacing: -0.8,
    color: c.bg,
  },
  subtitleShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '35%' },
  subtitle: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 22,
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    textShadowColor: '#000000cc',
    textShadowRadius: 6,
  },

  chat: { flex: 1, justifyContent: 'center', gap: 10 },
  message: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '86%' },
  messagePicked: { transform: [{ scale: 1.04 }], marginLeft: 6 },
  bubble: {
    backgroundColor: c.card,
    borderRadius: radius.lg,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1.5,
    borderColor: 'transparent',
    flexShrink: 1,
  },
  bubblePicked: { borderColor: c.accent, backgroundColor: c.raised },
  bubbleName: { fontFamily: fonts.displayBold, fontSize: 12, color: c.muted, marginBottom: 2 },
  bubbleText: { ...type.body, color: c.text },
  thisOne: {
    alignSelf: 'flex-start',
    marginLeft: 46,
    backgroundColor: c.highlight,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  thisOneText: { fontFamily: fonts.scriptBold, fontSize: 12, letterSpacing: 1.4, color: c.text },

  castCard: {
    width: '100%',
    backgroundColor: c.card,
    borderRadius: radius.xl,
    padding: space.xl,
    gap: space.xl,
    alignItems: 'center',
  },
  castRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch' },
  castMember: { alignItems: 'center', gap: 8 },
  joined: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: c.success,
    borderWidth: 2,
    borderColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinedMark: { color: c.bg, fontSize: 11, fontWeight: '900' },

  pick: { flex: 1, justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridPoster: { width: '48%', flexGrow: 1 },
  script: { marginTop: -28, marginHorizontal: 18, transform: [{ rotate: '-2deg' }] },
});
