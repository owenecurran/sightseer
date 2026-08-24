import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { StickerLink } from '@/components/ui/sticker-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { harmonyLabel, LOW_EVIDENCE_THRESHOLD, type Harmony } from '@/lib/harmony';
import { colorForRating } from '@/lib/rating-gradient';

type HarmonyMeterProps = {
  harmony: Harmony;
  userName: string;
  // Only the target is needed now — the focused screen fetches its own
  // reasoning from the session.
  otherId: string;
};

// How alike two travellers look, as a bar plus an honest caption.
//
// The caption matters as much as the number. The score is deliberately
// shrunk toward 50 when there's little to go on (see the get_harmony
// migration), so a thin-evidence 52 means "we can't really tell yet" rather
// than "you're 52% alike" — and the UI has to say which, or the number
// implies a precision the data doesn't have.
export function HarmonyMeter({ harmony, userName, otherId }: HarmonyMeterProps) {
  const score = harmony.score ?? 50;
  // Reuses the rating gradient (0-10) by rescaling, so a strong match is
  // the same green a great review is — one colour language for "good".
  const color = colorForRating(score / 10);
  const isThin = harmony.evidence < LOW_EVIDENCE_THRESHOLD;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.headerRow}>
        <ThemedText type="sectionLabel">Harmony</ThemedText>
        <ThemedText type="statLine" style={{ color }}>
          {score}
        </ThemedText>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${score}%`, backgroundColor: color }]} />
      </View>

      {/* One tagline, not a breakdown. The specifics moved to the "Learn
          why" screen, where each shared place can be named and shown rather
          than summarised into a sentence nobody can act on. */}
      <ThemedText type="smallBold">{harmonyLabel(score)}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {isThin
          ? `Not much to go on yet — you and ${userName} need more overlap before this means much.`
          : `How alike you and ${userName} travel.`}
      </ThemedText>

      {/* Opens its own screen rather than expanding here: the reasoning is
          a long, link-rich list split across two kinds of evidence, which
          reads badly crammed under a meter on someone's profile. */}
      <StickerLink
        label="Learn why"
        seed={otherId}
        onPress={() =>
          router.push({ pathname: '/harmony', params: { user: otherId, name: userName } })
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(234,231,207,0.15)',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
});
