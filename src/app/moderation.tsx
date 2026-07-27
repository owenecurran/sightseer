import { useFocusEffect, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import {
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
  const [reports, setReports] = useState<PendingReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      setError(null);
      listPendingReports()
        .then(setReports)
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not load reports.'))
        .finally(() => setIsLoading(false));
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={() => router.back()}>
          <ThemedText type="link">← Back</ThemedText>
        </Pressable>

        <ThemedText type="subtitle">Reports</ThemedText>

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
              <ThemedText type="smallBold">{report.placeName}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {report.authorName} · {report.visitRating.toFixed(1)} ★
                {report.visitNote ? ` · ${report.visitNote}` : ''}
              </ThemedText>
              <ThemedText type="small">
                Reported for {REASON_LABELS[report.reason]} by {report.reporterName}
              </ThemedText>
              {!report.visitId && (
                <ThemedText type="small" themeColor="textSecondary">
                  Visit already deleted by its owner.
                </ThemedText>
              )}

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
              </View>
            </ThemedView>
          ))}
        </View>
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
  list: {
    gap: Spacing.three,
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
