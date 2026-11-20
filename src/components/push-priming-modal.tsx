import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fold, Unfold } from '@/components/ui/unfold';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { registerForPush } from '@/lib/push';
import { shouldShowPushPriming, snoozePushPriming } from '@/lib/push-priming';

type PushPrimingModalProps = {
  // Null until signup is finished — see the root layout. Nothing is asked
  // before there is an account to notify.
  userId: string | null;
};

// Asks for notifications in our own words before the OS asks in its own.
//
// iOS gives an app exactly one permission alert, its wording fixed and
// uncustomisable, and a decline is effectively permanent — after it,
// requestPermissionsAsync returns denied without rendering anything and only
// Settings can undo it. So the only place left to explain what we would
// actually send is a screen of our own, shown first.
//
// The asymmetry is the point: "Not now" here costs nothing, because the real
// prompt was never spent and we can ask again in a month. "Don't allow" on
// the system alert costs everything.
export function PushPrimingModal({ userId }: PushPrimingModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let isActive = true;
    shouldShowPushPriming().then((should) => {
      if (isActive && should) setIsVisible(true);
    });
    return () => {
      isActive = false;
    };
  }, [userId]);

  async function handleEnable() {
    if (!userId) return;
    setIsBusy(true);
    // This is what triggers the real OS alert. Whatever they choose there,
    // this card has done its job and closes — a decline is recorded by the
    // OS itself, and shouldShowPushPriming will read it as 'blocked' and
    // never ask again.
    await registerForPush(userId);
    setIsBusy(false);
    setIsVisible(false);
  }

  async function handleNotNow() {
    await snoozePushPriming();
    setIsVisible(false);
  }

  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={handleNotNow}>
      <View style={styles.overlay}>
        <Unfold paper="backgroundElement" style={styles.sheet}>
          <Fold>
            <ThemedText type="displaySerif">Get notified</ThemedText>
          </Fold>
          <Fold>
            <ThemedText type="lead">
              We&apos;ll let you know when someone likes or comments on your review, tags you in
              theirs, or follows you, plus a weekly catch-up if you fall behind on people you
              follow.
            </ThemedText>
          </Fold>
          <Fold>
            <ThemedText type="caption">
              You can change any of this later in Settings.
            </ThemedText>
          </Fold>

          <Fold>
            <Button
              label={isBusy ? 'Just a moment…' : 'Turn on notifications'}
              onPress={handleEnable}
              disabled={isBusy}
            />
          </Fold>
          <Fold>
            <Pressable onPress={handleNotNow} disabled={isBusy} hitSlop={8} style={styles.notNow}>
              <ThemedText type="action">
                Not now
              </ThemedText>
            </Pressable>
          </Fold>
        </Unfold>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  notNow: {
    alignSelf: 'center',
    paddingVertical: Spacing.one,
  },
});
