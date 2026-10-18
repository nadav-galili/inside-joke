import { VIDEO_STYLES, type VideoStyle } from '@insidejoke/shared';
import { router, useFocusEffect } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeInUp,
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
import logo from '../../assets/logo.png';
import { GenrePoster, ScriptPage, scriptText } from '../components/cinema';
import { Avatar, Body, Button, Eyebrow, Pill, Pressy, Title } from '../components/ui';
import { track } from '../lib/analytics';
import { SAMPLES, type Sample } from '../lib/samples';
import { STYLE_LABELS } from '../lib/styles';
import { colors as c, fonts, radius, space, type } from '../lib/theme';

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
        <View style={styles.brand} accessible accessibilityLabel="Inside Joke">
          <Image source={logo} style={styles.logo} />
          <Text style={styles.brandName}>Inside Joke</Text>
        </View>
        <Pressy
          accessibilityRole="button"
          hitSlop={12}
          testID="welcome-sign-in"
          onPress={() => finish(true)}
        >
          <Text style={styles.signIn}>Sign in</Text>
        </Pressy>
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
            {/* Every page's stage is the same size, so the first one measures for all. */}
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
              {i === 0 && (
                <Pressy
                  accessibilityRole="button"
                  accessibilityLabel="Take the tour of the app"
                  hitSlop={8}
                  onPress={() => router.push('/trailer')}
                  style={styles.tour}
                >
                  <Text style={styles.tourText}>▶ Take the 27-second tour</Text>
                </Pressy>
              )}
            </View>
          </View>
        ))}
      </Animated.ScrollView>
      <View style={styles.footer}>
        <View
          style={styles.dots}
          accessible
          accessibilityLabel={`Page ${page + 1} of ${PAGES.length}`}
        >
          {PAGES.map((p, i) => (
            <Dot key={p.title} index={i} x={x} width={width} />
          ))}
        </View>
        <Button
          title={last ? 'Make one starring your friends' : 'Next'}
          onPress={next}
          testID="welcome-next"
        />
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

// Page 1: the samples. Each starts as the group chat it came from, then cuts hard to the film.

/** How long the chat shows before the cut to the film. */
const CHAT_MS = 1700;
const BUBBLE_MS = 380;

/**
 * Plays the samples one after another. A tap during the chat cuts straight to the film, a tap on
 * the film skips to the next sample, and the chip turns the sound on. With reduced motion on, a sample loops until it's tapped instead of moving on.
 */
const SampleReel: Stage = ({ active, height }) => {
  const still = useReducedMotion();
  const focused = useFocused();
  const playing = active && focused;
  const [i, setI] = useState(0);
  const [showFilm, setShowFilm] = useState(false);
  const [muted, setMuted] = useState(true);
  const progress = useSharedValue(0);
  const sample = SAMPLES[i]!;
  // The chat comes back in the same update, so the next film never mounts for a frame.
  const advance = useCallback(() => {
    setShowFilm(false);
    setI((v) => (v + 1) % SAMPLES.length);
  }, []);

  useEffect(() => {
    setShowFilm(false);
    progress.value = 0;
    if (!playing) return;
    const t = setTimeout(() => setShowFilm(true), CHAT_MS);
    return () => clearTimeout(t);
  }, [playing, i, progress]);

  // Room under the frame for the tagline.
  const frameH = Math.min(height - 44, 460);
  const frameW = (frameH * 9) / 16;
  return (
    <View style={styles.center}>
      <Pressy
        haptic="tick"
        onPress={showFilm ? advance : () => setShowFilm(true)}
        accessibilityRole="button"
        accessibilityLabel={`Sample video: ${sample.title}, a ${STYLE_LABELS[sample.genre].label.toLowerCase()}. Tap for the next one.`}
        style={[styles.frame, { width: frameW, height: frameH }]}
      >
        {showFilm && playing ? (
          <Film
            key={sample.title}
            sample={sample}
            muted={muted}
            loop={still}
            progress={progress}
            onEnd={advance}
          />
        ) : (
          <SampleChat key={sample.title} sample={sample} />
        )}
        <View style={styles.progress}>
          {SAMPLES.map((s, k) => (
            <View key={s.title} style={styles.progressTrack}>
              {k < i && <View style={[styles.progressFill, { width: '100%' }]} />}
              {k === i && <Fill progress={progress} />}
            </View>
          ))}
        </View>
        {showFilm && playing && (
          <Pressy
            haptic="tick"
            hitSlop={10}
            onPress={() => setMuted((m) => !m)}
            accessibilityRole="button"
            accessibilityLabel={muted ? 'Turn sound on' : 'Turn sound off'}
            style={styles.sound}
          >
            <Text style={styles.soundText}>{muted ? 'Tap for sound' : 'Sound on'}</Text>
          </Pressy>
        )}
      </Pressy>
      <Animated.Text key={sample.title} entering={FadeIn.duration(400)} style={styles.tagline}>
        {sample.tagline}
      </Animated.Text>
    </View>
  );
};

/** Whether this screen is the one on top, so the sample stops playing under the sign-in screen. */
function useFocused() {
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused;
}

/** The chat the sample came from, typed out bubble by bubble. */
function SampleChat({ sample }: { sample: Sample }) {
  const shown = useBeat(true, BUBBLE_MS, sample.chat.length);
  return (
    <View style={styles.sampleChat}>
      {sample.chat.slice(0, shown + 1).map((m, k) =>
        'note' in m ? (
          <Animated.Text key={k} entering={FadeIn.duration(300)} style={styles.chatNote}>
            {m.note}
          </Animated.Text>
        ) : (
          <Animated.View
            key={k}
            entering={FadeInUp.springify().damping(16)}
            style={[styles.message, styles.sampleMessage]}
          >
            <Avatar name={m.name} size={26} />
            <View style={styles.bubble}>
              <Text style={styles.bubbleName}>{m.name}</Text>
              <Text style={styles.bubbleText}>{m.text}</Text>
            </View>
          </Animated.View>
        ),
      )}
      <Text style={styles.sampleGenre}>{STYLE_LABELS[sample.genre].label.toUpperCase()}</Text>
    </View>
  );
}

/** The film itself, over its first frame so the cut is instant while the video loads. */
function Film({
  sample,
  muted,
  loop,
  progress,
  onEnd,
}: {
  sample: Sample;
  muted: boolean;
  loop: boolean;
  progress: SharedValue<number>;
  onEnd: () => void;
}) {
  const player = useVideoPlayer(sample.video, (p) => {
    p.muted = true;
    p.loop = loop;
    p.timeUpdateEventInterval = 0.25;
    p.play();
  });
  useEffect(() => {
    player.muted = muted;
    player.loop = loop;
  }, [player, muted, loop]);
  useEffect(() => {
    const time = player.addListener('timeUpdate', ({ currentTime }) => {
      if (player.duration > 0) {
        progress.value = withTiming(currentTime / player.duration, {
          duration: 250,
          easing: Easing.linear,
        });
      }
    });
    const end = player.addListener('playToEnd', () => {
      if (!loop) onEnd();
    });
    return () => {
      time.remove();
      end.remove();
    };
  }, [player, progress, loop, onEnd]);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Image source={sample.poster} style={StyleSheet.absoluteFill} />
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />
    </View>
  );
}

/** The bar that fills while the current sample plays. */
function Fill({ progress }: { progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  return <Animated.View style={[styles.progressFill, style]} />;
}

// Page 2: the moment in the group chat.

const CHAT = [
  { name: 'Theo', text: 'who ate my hummus' },
  { name: 'Gus', text: 'define ate' },
  { name: 'Bea', text: "gus there's a spoon in your bag" },
  { name: 'Gus', text: 'i was holding it for a friend' },
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

const CAST = ['You', 'Theo', 'Gus', 'Bea'];

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

// Telenovela first, since it's the one picked.
const GENRES: VideoStyle[] = ['telenovela', ...VIDEO_STYLES.filter((g) => g !== 'telenovela')];

const GenrePick: Stage = ({ active, height }) => {
  const step = useBeat(active, 700, 2);
  // Two rows of posters, with the script page overlapping the second by 28.
  const posterH = Math.max(72, Math.min(104, (height - 120) / 2));
  return (
    <View style={styles.pick} accessibilityElementsHidden>
      <View style={styles.grid}>
        {GENRES.map((g) => (
          <GenrePoster
            key={g}
            genre={g}
            height={posterH}
            selected={step >= 1 && g === 'telenovela'}
            style={styles.gridPoster}
          />
        ))}
      </View>
      {step >= 2 && (
        <Animated.View entering={FadeInUp.springify().damping(16)} style={styles.script}>
          <ScriptPage>
            <Text style={scriptText.action}>Gus clutches a spoon. Thunder.</Text>
            <Text style={scriptText.speaker}>Gus</Text>
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
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 34, height: 34, borderRadius: 9 },
  brandName: { fontFamily: fonts.display, fontSize: 18, letterSpacing: -0.4, color: c.text },
  signIn: { fontFamily: fonts.displayBold, fontSize: 15, color: c.accent },
  tour: { alignSelf: 'flex-start', paddingVertical: 4 },
  tourText: { fontFamily: fonts.displayBold, fontSize: 15, color: c.accent },
  page: { flex: 1, paddingHorizontal: 20 },
  stage: { flex: 1, justifyContent: 'center' },
  copy: { gap: 10, paddingTop: space.md, paddingBottom: space.sm, minHeight: 168 },
  footer: { paddingHorizontal: 20, paddingTop: space.sm, paddingBottom: space.sm, gap: space.lg },
  dots: { flexDirection: 'row', gap: 6, alignSelf: 'center' },
  dot: { height: 7, borderRadius: 4, backgroundColor: c.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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
  sound: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    backgroundColor: '#000000aa',
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  soundText: { fontFamily: fonts.displayBold, fontSize: 13, color: '#ffffff' },
  tagline: {
    marginTop: space.md,
    fontFamily: fonts.display,
    fontSize: 17,
    letterSpacing: -0.3,
    color: c.text,
    textAlign: 'center',
  },
  sampleChat: { flex: 1, justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  sampleMessage: { maxWidth: '100%' },
  chatNote: { ...type.small, color: c.faint, textAlign: 'center', fontStyle: 'italic' },
  sampleGenre: {
    position: 'absolute',
    bottom: 18,
    alignSelf: 'center',
    fontFamily: fonts.scriptBold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: c.muted,
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
  bubblePicked: { borderColor: c.text, backgroundColor: c.raised },
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
