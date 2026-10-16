import { VIDEO_SECONDS } from '@insidejoke/shared';
import { StyleSheet, Text, View } from 'react-native';

export default function Home() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Inside Joke</Text>
      <Text>Turn your group chat into a {VIDEO_SECONDS}-second movie starring your friends.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 32, fontWeight: '700' },
});
