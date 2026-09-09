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
import { authErrorMessage, isEmailNotConfirmed } from '@/lib/auth-errors';
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

// Captcha is NOT signup-only.
//
// Once captcha protection is enabled on the project, Supabase enforces it
// on every auth grant — password sign-in, password recovery and resend
// included, not just /signup. A form that omits the token is not merely
// unprotected, it is BROKEN: the endpoint rejects it outright. That is how
// enabling Turnstile locked every existing account out of signing in.
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

// Asking for another confirmation link.
//
// Shared by the sign-in form and the post-signup screen: both want the same
// email, and both have to send a captcha token because Supabase gates
// /resend exactly like every other auth endpoint.
function resendConfirmationEmail(email: string, captchaToken: string | null) {
  return supabase.auth.resend({
    type: 'signup',
    email,
    options: captchaToken ? { captchaToken } : undefined,
  });
}

export function SignInForm({ onForgotPassword }: { onForgotPassword?: () => void }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  // Set only when a sign-in failed because the address is unconfirmed, and
  // holds the address itself so the resend goes to what was actually typed.
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleSignIn() {
    setError(null);
    setUnconfirmedEmail(null);
    setResent(false);

    if (isTurnstileConfigured && !captchaToken) {
      setError('Please complete the security check.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Email sign-in is unchanged; a bare handle (no "@") routes through
      // resolve-username-signin instead — see src/lib/username-signin.ts.
      if (identifier.includes('@')) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: identifier,
          password,
          options: captchaToken ? { captchaToken } : undefined,
        });
        if (signInError) throw signInError;
      } else {
        await signInWithUsername(identifier, password, captchaToken);
      }
      // On success, AuthProvider picks up the new session and the root
      // layout redirects.
    } catch (err) {
      setError(authErrorMessage(err, 'Could not sign in. Please try again.'));
      // Only the email path can offer a resend. resolve-username-signin
      // answers every failure with one generic message on purpose, so that
      // a handle never reveals whether an account exists — which means it
      // cannot tell us which address to send to either.
      if (isEmailNotConfirmed(err) && identifier.includes('@')) {
        setUnconfirmedEmail(identifier.trim());
      }
      // Single-use, and already spent against the failed attempt.
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendConfirmation() {
    if (!unconfirmedEmail) return;
    setError(null);

    // The sign-in attempt spent the previous token and reset the widget, so
    // this is a genuinely new one rather than the one that just failed.
    if (isTurnstileConfigured && !captchaToken) {
      setError('Please complete the security check, then try again.');
      return;
    }

    setIsResending(true);
    const { error: resendError } = await resendConfirmationEmail(unconfirmedEmail, captchaToken);
    setIsResending(false);

    if (resendError) {
      setError(authErrorMessage(resendError, 'Could not send another email just now.'));
    } else {
      setResent(true);
    }
    setCaptchaToken(null);
    setCaptchaReset((n) => n + 1);
  }

  return (
    <View style={styles.form}>
      <TextField
        placeholder="Email or username"
        value={identifier}
        onChangeText={(next) => {
          setIdentifier(next);
          // Typing a different address should not leave an offer to resend
          // to the previous one standing underneath it.
          setUnconfirmedEmail(null);
          setResent(false);
        }}
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
      <Turnstile onToken={setCaptchaToken} action="signin" resetSignal={captchaReset} />
      <Button label="Sign in" onPress={handleSignIn} loading={isSubmitting} />
      {/* Only after a sign-in that failed for this specific reason —
          otherwise it is an unexplained button on a form nobody has
          submitted yet. */}
      {unconfirmedEmail && !resent && (
        <Button
          label="Resend confirmation email"
          variant="secondary"
          onPress={handleResendConfirmation}
          loading={isResending}
        />
      )}
      {resent && (
        <ThemedText type="small" themeColor="sage">
          Sent again to {unconfirmedEmail}. It can take a minute to arrive.
        </ThemedText>
      )}
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
      setError(authErrorMessage(signUpError, 'Could not create the account. Please try again.'));
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
          exiting={FadeOutUp.duration(REVEAL_MS)}
        >
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
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  async function handleResend() {
    setError(null);
    setResent(false);

    if (isTurnstileConfigured && !captchaToken) {
      setError('Please complete the security check.');
      return;
    }

    setIsResending(true);
    const { error: resendError } = await resendConfirmationEmail(email, captchaToken);
    setIsResending(false);

    if (resendError) {
      setError(authErrorMessage(resendError, 'Could not send another email just now.'));
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
      return;
    }
    setResent(true);
    // Spent. Asking for another needs a fresh one.
    setCaptchaToken(null);
    setCaptchaReset((n) => n + 1);
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
      <Turnstile onToken={setCaptchaToken} action="resend" resetSignal={captchaReset} />
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
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  async function handleSubmit() {
    setError(null);

    if (isTurnstileConfigured && !captchaToken) {
      setError('Please complete the security check.');
      return;
    }

    setIsSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL('/reset-password'),
      captchaToken: captchaToken ?? undefined,
    });
    setIsSubmitting(false);

    if (resetError) {
      setError(authErrorMessage(resetError, 'Could not send the reset link. Please try again.'));
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
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
      <Turnstile onToken={setCaptchaToken} action="reset" resetSignal={captchaReset} />
      <Button
        label="Send reset link"
        onPress={handleSubmit}
        loading={isSubmitting}
        disabled={!email.trim()}
      />
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
