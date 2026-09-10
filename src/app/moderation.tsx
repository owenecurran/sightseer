import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { listBannedUsers, setUserBanned, UNDERAGE_REASON, type BannedUser } from '@/lib/bans';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PageLoader } from '@/components/ui/page-loader';
import { RatingGlassBadgeGated } from '@/components/ui/rating-glass-badge-gated';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import {
  banUserAndResolveReport,
  dismissReport,
  listPendingReports,
  removeVisitAndResolveReport,
  type PendingReport,
} from '@/lib/reports';

const REASON_LABELS: Record<PendingReport['reason'], string> = {
  spam: 'Spam',
  inappropriate: 'Inappropriate',
  harassment: 'Harassment',
  other: 'Other',
};

export default function ModerationScreen() {
  const bottomInset = useBottomTabInset();
  const [reports, setReports] = useState<PendingReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  // Which row is mid-confirm, if any. Holding the id rather than a boolean
  // means opening the confirm on one report closes it on any other.
  const [confirmingBanId, setConfirmingBanId] = useState<string | null>(null);
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const scrollHandler = useHideOnScrollHandler();

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      setError(null);
      Promise.all([listPendingReports(), listBannedUsers()])
        .then(([pending, banned]) => {
          setReports(pending);
          setBannedUsers(banned);
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not load reports.'))
        .finally(() => {
          setIsLoading(false);
          setHasLoadedOnce(true);
        });
    }, [])
  );

  async function handleDismiss(reportId: string) {
    setError(null);
    try {
      await dismissReport(reportId);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not dismiss that report.');
    }
  }

  // A ban is reversible by another admin, so it gets an inline confirm
  // rather than the typed-handle modal account deletion uses — but it still
  // gets a confirm, because it is one tap away from Dismiss and lands on a
  // real person.
  async function handleBan(report: PendingReport) {
    if (!report.reportedUserId) return;
    setError(null);
    try {
      await banUserAndResolveReport(report.id, report.reportedUserId, report.reason);
      setReports((prev) => prev.filter((r) => r.id !== report.id));
      setBannedUsers(await listBannedUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not ban that user.');
    } finally {
      setConfirmingBanId(null);
    }
  }

  async function handleUnban(userId: string) {
    setError(null);
    try {
      await setUserBanned(userId, null);
      setBannedUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not lift that ban.');
    }
  }

  async function handleRemove(report: PendingReport) {
    if (!report.visitId) return;
    setError(null);
    try {
      await removeVisitAndResolveReport(report.id, report.visitId);
      setReports((prev) => prev.filter((r) => r.id !== report.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that visit.');
    }
  }

  if (!hasLoadedOnce) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
        <BackLink seed="moderation" />

        <ThemedText type="displaySerif">Reports</ThemedText>

        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}

        {!isLoading && reports.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            No pending reports.
          </ThemedText>
        )}

        <View style={styles.list}>
          {reports.map((report) => (
            <ThemedView key={report.id} type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{report.placeName ?? report.authorName}</ThemedText>
              {report.placeName && (
                <View style={styles.reportMeta}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.reportMetaText}>
                    {[report.authorName, report.visitNote].filter(Boolean).join(' · ')}
                  </ThemedText>
                  {report.visitRating != null && (
                    <RatingGlassBadgeGated rating={report.visitRating} size={REPORT_STAMP_SIZE} />
                  )}
                </View>
              )}
              <ThemedText type="small">
                Reported for {REASON_LABELS[report.reason]} by {report.reporterName}
              </ThemedText>
              {report.details && (
                <ThemedText type="small" themeColor="textSecondary">
                  “{report.details}”
                </ThemedText>
              )}
              {report.placeName && !report.visitId && (
                <ThemedText type="small" themeColor="textSecondary">
                  Visit already deleted by its owner.
                </ThemedText>
              )}
              {!report.placeName && (
                <ThemedText type="small" themeColor="textSecondary">
                  Reported this user directly — no specific post.
                </ThemedText>
              )}

              {confirmingBanId === report.id ? (
                <View style={styles.actionsRow}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.reportMetaText}>
                    Ban {report.authorName}?
                  </ThemedText>
                  <Pressable onPress={() => setConfirmingBanId(null)}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Cancel
                    </ThemedText>
                  </Pressable>
                  <Pressable onPress={() => handleBan(report)}>
                    <ThemedText type="smallBold">Confirm ban</ThemedText>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.actionsRow}>
                  <Pressable onPress={() => handleDismiss(report.id)}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Dismiss
                    </ThemedText>
                  </Pressable>
                  {report.visitId && (
                    <Pressable onPress={() => handleRemove(report)}>
                      <ThemedText type="smallBold">Delete visit</ThemedText>
                    </Pressable>
                  )}
                  {/* Absent when the visit is already gone and the report
                      named no user — there is no one left to act against. */}
                  {report.reportedUserId && (
                    <Pressable onPress={() => setConfirmingBanId(report.id)}>
                      <ThemedText type="smallBold">Ban user</ThemedText>
                    </Pressable>
                  )}
                </View>
              )}
            </ThemedView>
          ))}
        </View>

        {/* The way back out of a ban. Empty by default, so it costs nothing
            visually until there is something to undo — and an underage ban
            in particular is expected to show up here for exactly one
            reason: someone mistyped their birth year. */}
        {bannedUsers.length > 0 && (
          <>
            <ThemedText type="sectionLabel">Banned</ThemedText>
            <View style={styles.list}>
              {bannedUsers.map((user) => (
                <ThemedView key={user.id} type="backgroundElement" style={styles.card}>
                  <ThemedText type="smallBold">{user.name ?? user.handle ?? 'Someone'}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {user.reason === UNDERAGE_REASON
                      ? 'Under the age minimum'
                      : (user.reason ?? 'No reason recorded')}
                  </ThemedText>
                  <View style={styles.actionsRow}>
                    <Pressable onPress={() => handleUnban(user.id)}>
                      <ThemedText type="smallBold">Lift ban</ThemedText>
                    </Pressable>
                  </View>
                </ThemedView>
              ))}
            </View>
          </>
        )}
        </Animated.ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

// Small: an admin triage row, where the rating is a supporting detail
// rather than the subject.
const REPORT_STAMP_SIZE = 26;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
    gap: Spacing.three,
  },
  list: {
    gap: Spacing.three,
  },
  reportMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  // Takes the slack so a long note wraps rather than shoving the stamp off
  // the row.
  reportMetaText: {
    flex: 1,
  },
  card: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
});
