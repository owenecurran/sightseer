import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FindFriendsPanel } from '@/components/find-friends-panel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BackLink } from '@/components/ui/back-link';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';

// Find friends, reached from Settings.
//
// The screen itself is chrome now — a back link and a title around
// FindFriendsPanel, which is the same component the sign-up step renders.
// One implementation, so the two cannot drift; that was the whole point of
// pulling it out.
export default function ContactsSyncScreen() {
  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <BackLink seed="contacts-sync" />
        <ThemedText type="displaySerif">Find friends</ThemedText>
        <FindFriendsPanel />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
    gap: Spacing.three,
  },
});
