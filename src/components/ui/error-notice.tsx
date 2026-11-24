import { router, usePathname } from 'expo-router';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useScreenReload } from '@/components/screen-frame';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { reportError } from '@/lib/error-report';
import { needsSettings, openAppSettings } from '@/lib/permissions';
import { errorBehind } from '@/lib/user-error';

type ErrorNoticeProps = {
  // What went wrong, already put for people (see userErrorMessage).
  message: string;
  // How to try again. Left out, it loads the whole screen again, which runs
  // its loading from the start (see useScreenReload). False for no button,
  // where trying again would not help.
  onRetry?: (() => void) | false;
  style?: StyleProp<ViewStyle>;
};

// A failure the person can do something about: what happened, a way to try
// again, and a way to tell us. For something that failed to load or save.
// Not for a form's own complaints ("Write a little about what went wrong
// first."), which are answered by fixing the form.
//
// It used to be the red sentence alone, and a screen whose content failed to
// load stopped there: nothing to press but back.
export function ErrorNotice({ message, onRetry, style }: ErrorNoticeProps) {
  const reloadScreen = useScreenReload();
  const pathname = usePathname();
  const retry = onRetry === false ? null : (onRetry ?? reloadScreen);

  function tellUs() {
    // What actually went wrong, with its stack, goes to the error log now,
    // while it is still known; the report screen takes the person's own
    // account of it. Only when asked, so a failure nobody minds stays quiet.
    const error = errorBehind(message);
    if (error != null) reportError(`reported:${pathname}`, error);
    router.push({ pathname: '/report-bug', params: { from: pathname } });
  }

  // A permission only Settings can give back: going there is the one thing
  // that helps. Reloading would refuse again, and there is nothing to report.
  if (needsSettings(message)) return <FormError message={message} style={style} />;

  return (
    <View style={[styles.notice, style]}>
      <ThemedText type="small" themeColor="danger">
        {message}
      </ThemedText>
      <View style={styles.actions}>
        {retry && (
          // "Reload page" when it is the whole screen that goes again: on a
          // screen whose one error line also reports a failed save, "Try
          // again" would promise to repeat the save, which it does not.
          <Button label={onRetry ? 'Try again' : 'Reload page'} variant="secondary" onPress={retry} />
        )}
        {/* Typed, as the text action beside a button is everywhere else
            (Cancel under Save, Close on a menu). */}
        <ThemedText type="action" onPress={tellUs}>
          Tell us about it
        </ThemedText>
      </View>
    </View>
  );
}

type FormErrorProps = {
  message: string;
  style?: StyleProp<ViewStyle>;
};

// A form's own error line: the sentence in red, as every form has it. When
// the sentence is about a permission the phone has refused (see
// permissions.ts), it comes with the way to Settings, typed as the text
// action beside a button is everywhere else.
export function FormError({ message, style }: FormErrorProps) {
  return (
    <View style={[styles.notice, style]}>
      <ThemedText type="small" themeColor="danger">
        {message}
      </ThemedText>
      {needsSettings(message) && (
        <ThemedText type="action" onPress={openAppSettings}>
          Open settings
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    gap: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
});
