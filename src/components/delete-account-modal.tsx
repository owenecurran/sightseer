import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fold, Unfold } from '@/components/ui/unfold';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { Turnstile, isTurnstileConfigured } from '@/components/auth/turnstile';
import { accountHasPassword, deleteAccount } from '@/lib/delete-account';
import { userErrorMessage } from '@/lib/user-error';

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
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Bumped to make Turnstile mint a fresh token. A token is single-use, so
  // after a rejected attempt the next one has to start over or it fails the
  // security check rather than the password.
  const [captchaNonce, setCaptchaNonce] = useState(0);
  // null while unknown. Nothing is gated on it until it resolves, which is
  // why the confirm button waits for it rather than defaulting either way:
  // defaulting to false would let an account with a password through without
  // one, and defaulting to true would demand a password from accounts that
  // have none.
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Asked once the sheet is actually open. An account that only ever signed
  // in with Google or Apple has no password to confirm — see
  // accountHasPassword.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    accountHasPassword()
      .then((result) => {
        if (!cancelled) setHasPassword(result);
      })
      .catch(() => {
        // Unknown means ASK. The server decides whether a password is
        // actually required, so the worst this causes is a field that
        // turns out not to have been needed.
        if (!cancelled) setHasPassword(true);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  function reset() {
    setStep(1);
    setTyped('');
    setPassword('');
    setCaptchaToken(null);
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
      await deleteAccount({ password, captchaToken });
      reset();
      onDeleted();
    } catch (err) {
      setError(userErrorMessage(err, 'Could not delete your account.'));
      // The token just spent is dead whether or not it was the problem.
      setCaptchaToken(null);
      setCaptchaNonce((n) => n + 1);
      setIsDeleting(false);
    }
  }

  const needsCaptcha = isTurnstileConfigured && hasPassword === true;
  const canConfirm =
    handle != null &&
    typed.trim().toLowerCase() === handle.trim().toLowerCase() &&
    hasPassword !== null &&
    (hasPassword === false || password.length > 0) &&
    (!needsCaptcha || captchaToken != null) &&
    !isDeleting;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.overlay}>
        <Unfold paper="backgroundElement" style={styles.sheet}>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            {step === 1 ? (
              <>
                <Fold>
                  <ThemedText type="displaySerif">Delete your account?</ThemedText>
                </Fold>
                <Fold>
                  <ThemedText type="caption">
                    This permanently removes your account and everything in it:
                  </ThemedText>
                </Fold>
                {/* Named specifically rather than as "your data", because the
                    surprising losses are the ones involving other people. */}
                <View style={styles.list}>
                  {[
                    'Every review, photo and rating you have posted',
                    'Your boards and travel books, including ones others saved',
                    'Comments you left on other people’s reviews',
                    'Your follows, likes and tags',
                  ].map((line) => (
                    <Fold key={line}>
                      <ThemedText type="caption">
                        • {line}
                      </ThemedText>
                    </Fold>
                  ))}
                </View>
                <Fold>
                  <ThemedText type="caption">
                    This cannot be undone, and there is no grace period to change your mind.
                  </ThemedText>
                </Fold>
                <Fold>
                  <Button label="Continue" onPress={() => setStep(2)} />
                </Fold>
                <Fold>
                  <Pressable onPress={handleCancel} hitSlop={8} style={styles.cancel}>
                    <ThemedText type="action">
                      Keep my account
                    </ThemedText>
                  </Pressable>
                </Fold>
              </>
            ) : (
              <>
                <Fold>
                  <ThemedText type="displaySerif">Are you sure?</ThemedText>
                </Fold>
                <Fold>
                  <ThemedText type="caption">
                    Type your handle{' '}
                    <ThemedText type="identifier">{handle ?? ''}</ThemedText> below to confirm.
                  </ThemedText>
                </Fold>
                <Fold>
                  <TextField
                    placeholder="Your handle"
                    value={typed}
                    onChangeText={setTyped}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Fold>

                {/* The handle proves they read the screen. The password
                    proves it is them — a session on an unlocked phone is
                    whoever is holding it. Verified server-side; this field
                    only collects it. */}
                {hasPassword === true && (
                  <>
                    <Fold>
                      <ThemedText type="caption">
                        Then enter your password.
                      </ThemedText>
                    </Fold>
                    <Fold>
                      <TextField
                        placeholder="Your password"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        autoCapitalize="none"
                        autoCorrect={false}
                        textContentType="password"
                      />
                    </Fold>
                    {isTurnstileConfigured && (
                      <Fold>
                        <Turnstile
                          onToken={setCaptchaToken}
                          action="signin"
                          resetSignal={captchaNonce}
                        />
                      </Fold>
                    )}
                  </>
                )}
                {error && (
                  <Fold>
                    <ThemedText type="small" themeColor="danger">
                      {error}
                    </ThemedText>
                  </Fold>
                )}
                <Fold>
                  <Button
                    label={isDeleting ? 'Deleting…' : 'Delete my account forever'}
                    onPress={handleConfirm}
                    disabled={!canConfirm}
                  />
                </Fold>
                <Fold>
                  <Pressable onPress={handleCancel} hitSlop={8} disabled={isDeleting} style={styles.cancel}>
                    <ThemedText type="action">
                      Keep my account
                    </ThemedText>
                  </Pressable>
                </Fold>
              </>
            )}
          </ScrollView>
        </Unfold>
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
  // A percentage cap works here because the overlay this sits in has a
  // definite height to take it of; the scroll view inside shrinks to it.
  sheet: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
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
