import { useColorScheme } from 'react-native';

const light = {
  bg: '#ffffff',
  card: '#f4f2ef',
  text: '#16130f',
  muted: '#6f6a63',
  border: '#e2ded8',
  accent: '#ff5a36',
  onAccent: '#ffffff',
  danger: '#d6342c',
};
const dark: typeof light = {
  bg: '#110f0d',
  card: '#1e1b18',
  text: '#f6f3ee',
  muted: '#a19b93',
  border: '#33302b',
  accent: '#ff6b49',
  onAccent: '#ffffff',
  danger: '#ff6259',
};
export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}
