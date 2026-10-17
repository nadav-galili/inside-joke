import type { VideoStyle } from '@insidejoke/shared';

/**
 * "Opening Night": the app is a small film studio for a friend group. It is always dark like a
 * theatre so videos and faces glow, and amber (the marquee bulb) is the only colour you can press.
 */
export const colors = {
  bg: '#1a0e16', // velvet: the ground
  card: '#251520',
  raised: '#33202c',
  border: '#4a3140',
  text: '#fff3e2', // house lights
  muted: '#bba2ab',
  faint: '#7d6570',
  accent: '#ffb53d', // marquee bulb
  onAccent: '#2a1405',
  paper: '#fbf3e4', // the screenplay page
  ink: '#2b1d1a',
  inkMuted: '#9a7e72',
  highlight: '#ffb53d55',
  danger: '#ff6b6b',
  success: '#5cc489',
  scrim: '#00000088',
};
export type Colors = typeof colors;

/** The palette. Kept as a hook so screens don't care that the app has a single theme. */
export function useColors(): Colors {
  return colors;
}

/** Each genre owns a colour that tints its poster and nothing else. */
export const GENRE_COLORS: Record<VideoStyle, { base: string; light: string; deep: string }> = {
  action_trailer_80s: { base: '#ff6a2b', light: '#ffd27a', deep: '#6b1405' },
  nature_documentary: { base: '#5cc489', light: '#d8ffd0', deep: '#0e3b21' },
  telenovela: { base: '#ff5fa2', light: '#ffd0e5', deep: '#5b0b33' },
  sports_commentary: { base: '#4fa8ff', light: '#cfe9ff', deep: '#0a2a5b' },
};

/** Monogram colours for people without a photo, picked from their name so they stay stable. */
const PERSON_COLORS = ['#ff6a2b', '#ff5fa2', '#4fa8ff', '#5cc489', '#ffb53d', '#b58cff'];
export function personColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return PERSON_COLORS[Math.abs(h) % PERSON_COLORS.length]!;
}

/** Font family names, as registered with useFonts in the root layout. Body text uses SF Pro. */
export const fonts = {
  display: 'BricolageGrotesque_800ExtraBold',
  displayBold: 'BricolageGrotesque_700Bold',
  displayMedium: 'BricolageGrotesque_500Medium',
  script: 'CourierPrime_400Regular',
  scriptBold: 'CourierPrime_700Bold',
};

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const type = {
  hero: { fontFamily: fonts.display, fontSize: 40, lineHeight: 42, letterSpacing: -1.4 },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 33, letterSpacing: -0.9 },
  heading: { fontFamily: fonts.displayBold, fontSize: 21, lineHeight: 25, letterSpacing: -0.3 },
  body: { fontSize: 16, lineHeight: 23 },
  small: { fontSize: 13, lineHeight: 18 },
  eyebrow: { fontFamily: fonts.scriptBold, fontSize: 12, letterSpacing: 1.6 },
  button: { fontFamily: fonts.display, fontSize: 17, letterSpacing: -0.2 },
} as const;
