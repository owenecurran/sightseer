import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PageLoader } from '@/components/ui/page-loader';
import { StretchText } from '@/components/ui/stretch-text';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import {
  getHarmony,
  getHarmonyBreakdown,
  harmonyLabel,
  LOW_EVIDENCE_THRESHOLD,
  type Harmony,
  type HarmonyReason,
} from '@/lib/harmony';
import { colorForRating } from '@/lib/rating-gradient';

// The full reasoning behind a harmony score, on its own screen rather than
// expanded inline under the meter: the list can run long, every row links
// somewhere else, and it splits into two genuinely different kinds of
// evidence that deserve their own headings.
export default function HarmonyScreen() {
  const { user: otherId, name } = useLocalSearchParams<{ user?: string; name?: string }>();
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const scrollHandler = useHideOnScrollHandler();

  const [harmony, setHarmony] = useState<Harmony | null>(null);
  const [reasons, setReasons] = useState<HarmonyReason[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userName = name ?? 'them';

  useFocusEffect(
    useCallback(() => {
      if (!session || !otherId) return;
      setError(null);
      (async () => {
        try {
          // Fetched together: the score and its reasoning are one thought,
          // and this screen cannot render usefully with only half of it.
          const [result, breakdown] = await Promise.all([
            getHarmony(session.user.id, otherId),
            getHarmonyBreakdown(session.user.id, otherId, 20),
          ]);
          setHarmony(result);
          setReasons(breakdown);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not work that out.');
        } finally {
          setHasLoadedOnce(true);
        }
      })();
    }, [session, otherId])
  );

  if (!hasLoadedOnce) return <PageLoader />;

  const score = harmony?.score ?? 50;
  const color = colorForRating(score / 10);
  const isThin = (harmony?.evidence ?? 0) < LOW_EVIDENCE_THRESHOLD;

  const places = reasons.filter((r) => r.kind === 'place');
  const areas = reasons.filter((r) => r.kind === 'area');

  function renderRow(reason: HarmonyReason) {
    return (
      <Pressable
        key={`${reason.kind}-${reason.placeId}`}
        onPress={() => router.push({ pathname: '/place/[id]', params: { id: reason.placeId } })}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <View style={styles.rowName}>
          <ThemedText type="small" numberOfLines={1}>
            {reason.name}
          </ThemedText>
          {reason.isLocal && (
            <ThemedText type="small" themeColor="sage">
              A local favourite
            </ThemedText>
          )}
        </View>
        <ThemedText type="smallBold" style={{ color: colorForRating(reason.myRating) }}>
          {reason.myRating.toFixed(1)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          vs
        </ThemedText>
        <ThemedText type="smallBold" style={{ color: colorForRating(reason.theirRating) }}>
          {reason.theirRating.toFixed(1)}
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
          <BackLink seed="harmony" />

          <ThemedText type="sectionLabel">Harmony with</ThemedText>
          <StretchText type="headline" fill>
            {userName}
          </StretchText>

          <ThemedView type="backgroundElement" style={styles.scoreCard}>
            <View style={styles.scoreRow}>
              <ThemedText type="displaySerif" style={{ color }}>
                {score}
              </ThemedText>
              <View style={styles.scoreText}>
                <ThemedText type="smallBold">{harmonyLabel(score)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {isThin
                    ? `Not much to go on yet — you and ${userName} need more overlap before this means much.`
                    : `Worked out from ${reasons.length} thing${reasons.length === 1 ? '' : 's'} you have in common.`}
                </ThemedText>
              </View>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${score}%`, backgroundColor: color }]} />
            </View>
          </ThemedView>

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          {places.length > 0 && (
            <View style={styles.section}>
              <ThemedText type="sectionLabel">Places you both rated</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                The strongest signal — the same spot, judged by both of you.
              </ThemedText>
              {places.map(renderRow)}
            </View>
          )}

          {areas.length > 0 && (
            <View style={styles.section}>
              <ThemedText type="sectionLabel">Places you both travelled to</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Compared on how each of you rated everything you did there.
              </ThemedText>
              {areas.map(renderRow)}
            </View>
          )}

          {reasons.length === 0 && !error && (
            <ThemedText type="small" themeColor="textSecondary">
              Nothing in common to point at yet. Once you have both been somewhere, this fills in.
            </ThemedText>
          )}
        </Animated.ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, width: '100%' },
  scrollContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
  },
  scoreCard: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  scoreText: { flex: 1, gap: Spacing.half },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(234,231,207,0.15)',
  },
  fill: { height: '100%', borderRadius: 4 },
  section: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  rowName: { flex: 1 },
  pressed: { opacity: 0.6 },
});
