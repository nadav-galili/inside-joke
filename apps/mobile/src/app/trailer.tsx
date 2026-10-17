import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import poster from '../../assets/trailer/trailer.jpg';
import video from '../../assets/trailer/trailer.mp4';
import { Pressy } from '../components/ui';
import { track } from '../lib/analytics';
import { colors as c, fonts, radius } from '../lib/theme';

/** The 27-second tour of the app (the App Store preview), with sound, before anyone signs in. */
export default function Trailer() {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(video, (p) => p.play());
  useEffect(() => {
    track('trailer_opened');
    const end = player.addListener('playToEnd', () => router.back());
    return () => end.remove();
  }, [player]);
  return (
    <View style={styles.screen}>
      <Image source={poster} style={styles.fill} resizeMode="contain" />
      <VideoView player={player} style={styles.fill} contentFit="contain" nativeControls={false} />
      <Pressy
        haptic="tick"
        hitSlop={12}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Close the tour"
        style={[styles.close, { top: insets.top + 8 }]}
      >
        <Text style={styles.closeText}>Close</Text>
      </Pressy>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  close: {
    position: 'absolute',
    right: 16,
    backgroundColor: '#000000aa',
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  closeText: { fontFamily: fonts.displayBold, fontSize: 14, color: '#ffffff' },
});
