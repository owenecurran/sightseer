import * as Linking from 'expo-linking';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Turnstile, isTurnstileConfigured } from '@/components/auth/turnstile';
import { SocialAuthButtons } from '@/components/ui/social-auth-buttons';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { signInWithUsername } from '@/lib/username-signin';

// The auth forms as components rather than whole screens.
//
// Extracted so the welcome screen can reveal one INSIDE its own panel
// instead of navigating away — the panel expands and the chosen form is
// underneath it, which is one continuous movement rather than a page
// change. The standalone (auth) routes render the same components, so there
// is exactly one implementation of each and the two entry points cannot
// drift apart.

const MIN_PASSWORD_LENGTH = 6;

// Mount/unmount is animated with Reanimated's layout animations rather
// than an animated height.
//
// The height approach needed the field's own measurement, and a wrapper
// collapsed to zero before that measurement arrives never gets one — the
// child stops reporting a layout and the field never appears. That is the
// same trap the welcome panel's stage hit, and it caught this too.
// entering/exiting need no measurement at all.
const REVEAL_MS = 260;

export function SignInForm({ onForgotPassword }: { onForgotPassword?: () => void }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignIn() {
    setError(null);
    setIsSubmitting(true);
    try {
      // Email sign-in is unchanged; a bare handle (no "@") routes through
      // resolve-username-signin instead — see src/lib/username-signin.ts.
      if (identifier.includes('@')) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: identifier,
          password,
        });
        if (signInError) throw signInError;
      } else {
        await signInWithUsername(identifier, password);
      }
      // On success, AuthProvider picks up the new session and the root
      // layout redirects.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.form}>
      <TextField
        placeholder="Email or username"
        value={identifier}
        onChangeText={setIdentifier}
        autoCapitalize="none"
        textContentType="username"
      />
      <TextField
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
      />
      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      )}
      <Button label="Sign in" onPress={handleSignIn} loading={isSubmitting} />
      {onForgotPassword && (
        <ThemedText type="link" style={styles.inlineLink} onPress={onForgotPassword}>
          Forgot password?
        </ThemedText>
      )}
      <SocialAuthButtons onError={setError} />
    </View>
  );
}

export function SignUpForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Bumped after a failed signup so the widget issues a fresh token — see
  // Turnstile's resetSignal.
  const [captchaReset, setCaptchaReset] = useState(0);

  async function handleSignUp() {
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    // Checked here rather than only on the server: the whole point of a
    // confirmation field is catching a typo before it becomes an account
    // nobody can sign into.
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    // Only enforced when a site key is actually configured. Without one the
    // widget never renders, and demanding a token nobody can produce would
    // lock signup entirely.
    if (isTurnstileConfigured && !captchaToken) {
      setError('Please complete the security check.');
      return;
    }

    setIsSubmitting(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      // Verified by Supabase against the Turnstile secret in the dashboard.
      // Undefined rather than null when unconfigured — the client rejects a
      // null here.
      options: captchaToken ? { captchaToken } : undefined,
    });
    setIsSubmitting(false);

    if (signUpError) {
      setError(signUpError.message);
      // A token is single-use: once Supabase has verified it, a retry with
      // the same one fails. Clearing the token is not enough on its own —
      // the widget has to be told to issue another, or the form can never
      // be resubmitted.
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
      return;
    }
    // No session yet means email confirmation is required before sign-in
    // works. Otherwise AuthProvider picks up the new session and the root
    // layout redirects to onboarding.
    if (!data.session) {
      setNeedsEmailConfirmation(true);
    }
  }

  if (needsEmailConfirmation) {
    return <ConfirmationPending email={email} />;
  }

  return (
    // LinearTransition so the fields below slide down as the confirm field
    // appears, rather than teleporting by its height the frame it mounts.
    <Animated.View style={styles.form} layout={LinearTransition.duration(REVEAL_MS)}>
      <TextField
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextField
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
      />
      {/* Only once there is a password to confirm. Showing it up front
          makes the form look twice as long as it is before anyone has typed
          anything, and there is nothing to compare against yet. */}
      {password.length > 0 && (
        <Animated.View
          entering={FadeInDown.duration(REVEAL_MS)}
          exiting={FadeOutUp.duration(REVEAL_MS)}>
          <TextField
            placeholder="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            textContentType="newPassword"
          />
        </Animated.View>
      )}
      <Turnstile onToken={setCaptchaToken} action="signup" resetSignal={captchaReset} />
      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      )}
      <Button label="Sign up" onPress={handleSignUp} loading={isSubmitting} />
      <SocialAuthButtons onError={setError} />
    </Animated.View>
  );
}

// Shown after signing up, while the account waits on a confirmation link.
//
// Its own component because it owns real state: the link expires, and mail
// goes missing, so being stuck here with no way to ask for another is a
// dead end that costs an account.
function ConfirmationPending({ email }: { email: string }) {
  const [isResending, setIsResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResend() {
    setError(null);
    setResent(false);
    setIsResending(true);
    const { error: resendError } = await supabase.auth.resend({ type: 'signup', email });
    setIsResending(false);

    if (resendError) {
      setError(resendError.message);
      return;
    }
    setResent(true);
  }

  return (
    <View style={styles.form}>
      <ThemedText type="default" themeColor="textSecondary">
        We sent a confirmation link to {email}. Confirm your address, then sign in.
      </ThemedText>
      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      )}
      {resent && (
        <ThemedText type="small" themeColor="sage">
          Sent again. It can take a minute to arrive.
        </ThemedText>
      )}
      <Button
        label="Resend confirmation email"
        variant="secondary"
        onPress={handleResend}
        loading={isResending}
      />
    </View>
  );
}

// Asking for a reset link. The screen at (auth)/forgot-password.tsx does the
// same thing standalone; this is the version the welcome panel reveals.
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL('/reset-password'),
    });
    setIsSubmitting(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <View style={styles.form}>
        {/* Deliberately generic regardless of whether the email exists —
            confirming it would tell anyone who asks which addresses have
            accounts. */}
        <ThemedText type="default" themeColor="textSecondary">
          If an account exists for {email}, we sent a link to reset the password.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.form}>
      <ThemedText type="default" themeColor="textSecondary">
        Enter your email and we will send a link to set a new password.
      </ThemedText>
      <TextField
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      )}
      <Button label="Send reset link" onPress={handleSubmit} loading={isSubmitting} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.three,
  },
  inlineLink: {
    alignSelf: 'center',
  },
});
