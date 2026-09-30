import { Linking, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAwareScroll } from '@/components/keyboard-aware-scroll';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BackLink } from '@/components/ui/back-link';
import { Button } from '@/components/ui/button';
import { PaperPanel } from '@/components/ui/paper-panel';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { submitBugReport } from '@/lib/bug-reports';
import { hasSupportEmail, SUPPORT_EMAIL } from '@/lib/legal';

// Report a bug.
//
// One field and a button, on purpose. Every extra box on a form like this —
// a category picker, a severity dropdown, "steps to reproduce" — is another
// thing between somebody noticing a problem and telling anyone about it, and
// a vague report that exists beats a well-structured one that was abandoned
// halfway.
//
// The version and platform go along automatically (see src/lib/bug-reports.ts).
// Asking "which build are you on" gets an answer from almost nobody and is
// needed for almost every report.
//
// KeyboardAwareScroll rather than a plain view: the field grows as it is
// typed into, and on a short screen the send button would otherwise end up
// under the keyboard just as somebody finished writing.

export default function ReportBugScreen() {
  const router = useRouter();
  // Optional, and unset from the Settings entry — where the answer would
  // only ever be "Settings". It is here so that a "report a bug" action
  // added to another screen later can say where it was opened from without
  // needing a migration.
  const { from } = useLocalSearchParams<{ from?: string }>();

  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (isSending) return;
    setIsSending(true);
    setError(null);
    const result = await submitBugReport(message, from ?? null);
    setIsSending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSent(true);
    setMessage('');
  }

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAwareScroll contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <BackLink seed="report-bug" />
          <ThemedText type="displaySerif">Report a bug</ThemedText>

          {sent ? (
            <PaperPanel seed="report-bug-sent" accentIndex={1} style={styles.panel}>
              <ThemedText type="sectionLabel">Thank you</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                That has been sent along with your app version, so it can be matched to the build
                you are on.
              </ThemedText>
              {/* Two ways out rather than one. Somebody who found a second
                  thing should not have to go back and in again. */}
              <Button label="Report something else" variant="secondary" onPress={() => setSent(false)} />
              <Button label="Done" onPress={() => router.back()} />
            </PaperPanel>
          ) : (
            <PaperPanel seed="report-bug" accentIndex={1} style={styles.panel}>
              <ThemedText type="small" themeColor="textSecondary">
                What went wrong? Anything you can say about what you were doing when it happened
                helps — even roughly.
              </ThemedText>
              <TextField
                placeholder="What happened?"
                value={message}
                onChangeText={setMessage}
                multiline
                autoCapitalize="sentences"
                style={styles.field}
              />
              {error && (
                <ThemedText type="small" themeColor="textSecondary">
                  {error}
                </ThemedText>
              )}
              <Button
                label="Send report"
                onPress={() => void handleSend()}
                loading={isSending}
                disabled={message.trim().length === 0}
              />
              <ThemedText type="small" themeColor="textSecondary">
                Your app version and device are included automatically. Nothing else from the app is
                attached.
              </ThemedText>
            </PaperPanel>
          )}

          {/* A second route out, for anything too long or too awkward to type
              into a phone — a screen recording, say, which this form has no
              way to take. */}
          {hasSupportEmail && (
            <ThemedText
              type="link"
              style={styles.email}
              onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Sightseer%20bug`)}>
              Or email {SUPPORT_EMAIL}
            </ThemedText>
          )}
        </KeyboardAwareScroll>
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
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  panel: {
    gap: Spacing.three,
  },
  field: {
    // A box that reads as "a few sentences" before anything is typed into
    // it. It grows from here — see TextField's own auto-grow.
    minHeight: 120,
    textAlignVertical: 'top',
  },
  email: {
    alignSelf: 'center',
  },
});
