import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { deleteAccount } from '@/lib/delete-account';

type DeleteAccountModalProps = {
  visible: boolean;
  // Typed back by the user to confirm. Their own handle rather than a fixed
  // word like DELETE: it cannot be muscle-memoried, and it makes the account
  // being destroyed explicit at the moment of destroying it.
  handle: string | null;
  onCancel: () => void;
  onDeleted: () => void;
};

// Two steps, because this is irreversible and there is no undo anywhere
// behind it: no grace period, no soft-delete, no support tooling to restore
// from. The first step explains what goes; the second makes you type your
// own handle to prove you read the first.
export function DeleteAccountModal({ visible, handle, onCancel, onDeleted }: DeleteAccountModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep(1);
    setTyped('');
    setError(null);
  }

  function handleCancel() {
    reset();
    onCancel();
  }

  async function handleConfirm() {
    setIsDeleting(true);
    setError(null);
    try {
      await deleteAccount();
      reset();
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete your account.');
      setIsDeleting(false);
    }
  }

  const canConfirm =
    handle != null && typed.trim().toLowerCase() === handle.trim().toLowerCase() && !isDeleting;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.overlay}>
        <ThemedView type="backgroundElement" style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {step === 1 ? (
              <>
                <ThemedText type="displaySerif">Delete your account?</ThemedText>
                <ThemedText type="body" themeColor="textSecondary">
                  This permanently removes your account and everything in it:
                </ThemedText>
                {/* Named specifically rather than as "your data", because the
                    surprising losses are the ones involving other people. */}
                <View style={styles.list}>
                  {[
                    'Every review, photo and rating you have posted',
                    'Your boards and travel books, including ones others saved',
                    'Comments you left on other people’s reviews',
                    'Your follows, likes and tags',
                  ].map((line) => (
                    <ThemedText key={line} type="small" themeColor="textSecondary">
                      • {line}
                    </ThemedText>
                  ))}
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  This cannot be undone, and there is no grace period to change your mind.
                </ThemedText>
                <Button label="Continue" onPress={() => setStep(2)} />
                <Pressable onPress={handleCancel} hitSlop={8} style={styles.cancel}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Keep my account
                  </ThemedText>
                </Pressable>
              </>
            ) : (
              <>
                <ThemedText type="displaySerif">Are you sure?</ThemedText>
                <ThemedText type="body" themeColor="textSecondary">
                  Type your handle{' '}
                  <ThemedText type="body">{handle ?? ''}</ThemedText> below to confirm.
                </ThemedText>
                <TextField
                  placeholder="Your handle"
                  value={typed}
                  onChangeText={setTyped}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {error && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {error}
                  </ThemedText>
                )}
                <Button
                  label={isDeleting ? 'Deleting…' : 'Delete my account forever'}
                  onPress={handleConfirm}
                  disabled={!canConfirm}
                />
                <Pressable onPress={handleCancel} hitSlop={8} disabled={isDeleting} style={styles.cancel}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Keep my account
                  </ThemedText>
                </Pressable>
              </>
            )}
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: Spacing.four,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  list: {
    gap: Spacing.one,
  },
  cancel: {
    alignSelf: 'center',
    paddingVertical: Spacing.one,
  },
});
