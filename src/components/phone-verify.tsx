import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Turnstile, isTurnstileConfigured } from '@/components/auth/turnstile';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { CodeInput } from '@/components/ui/code-input';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import {
  confirmPhoneLink,
  confirmPhoneSignIn,
  startPhoneLink,
  startPhoneSignIn,
  syncVerifiedContactKeys,
} from '@/lib/phone-auth';

// Prove a phone number by SMS, in two steps.
//
// One component for both places a number gets proved, because the shape of
// the interaction is identical and only the pair of calls underneath differs
// — see src/lib/phone-auth.ts for why those pairs are not interchangeable.
//
//   'signin' — no session. Creates the account or signs into the existing one.
//   'link'   — signed in already. Attaches a number to this account, which is
//              how somebody who joined with Apple or an email becomes
//              findable without starting over.
//
// Every code sent costs money (Twilio Verify, ~$0.05 a verification), which
// is the real reason for the cooldown below rather than politeness about
// rate limits.

const CODE_LENGTH = 6;

// GoTrue refuses a second code inside 60 seconds anyway; showing the wait
// beats showing its error.
const RESEND_COOLDOWN_SECONDS = 60;

type PhoneVerifyProps = {
  mode: 'signin' | 'link';
  // Fired once the number is confirmed. In 'link' mode the contact keys have
  // already been re-derived by then, so a caller can just refresh.
  onVerified: () => void;
  // Shown above the number field. Callers phrase this for their own screen.
  caption?: string;
};

export function PhoneVerify({ mode, onVerified, caption }: PhoneVerifyProps) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'number' | 'code'>('number');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  // Only the unauthenticated request is challenged — see startPhoneSignIn.
  const needsCaptcha = mode === 'signin' && isTurnstileConfigured;
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Turnstile tokens are SINGLE USE. Once GoTrue has verified one, the same
  // token is refused, so the widget has to be told to issue another after
  // every send — successful or not, because either way it has been spent.
  const [captchaReset, setCaptchaReset] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function send() {
    if (!phone.trim() || isBusy) return;
    if (needsCaptcha && !captchaToken) {
      setError('Please complete the security check.');
      return;
    }
    setIsBusy(true);
    setError(null);
    const result =
      mode === 'signin' ? await startPhoneSignIn(phone, captchaToken) : await startPhoneLink(phone);
    setIsBusy(false);
    // Spent either way.
    setCaptchaToken(null);
    setCaptchaReset((n) => n + 1);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setStage('code');
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  async function confirm() {
    if (code.trim().length < CODE_LENGTH || isBusy) return;
    setIsBusy(true);
    setError(null);
    const result =
      mode === 'signin' ? await confirmPhoneSignIn(phone, code) : await confirmPhoneLink(phone, code);
    if (!result.ok) {
      setIsBusy(false);
      setError(result.message);
      // The code is single-use once GoTrue has seen it, so a retry has to be
      // a fresh one. Clearing the field says that without a sentence.
      setCode('');
      return;
    }

    if (mode === 'link') {
      try {
        // The number is confirmed; this is what turns it into a matchable
        // hash. Derived server-side from auth.users, never from this screen.
        await syncVerifiedContactKeys();
      } catch {
        // The number is verified either way, which is the part that cannot
        // be redone. A failed derive is recovered by opening this screen
        // again, so it is not worth blocking the success on.
      }
    }
    setIsBusy(false);
    onVerified();
  }

  if (stage === 'number') {
    return (
      <View style={styles.wrap}>
        {caption && (
          <ThemedText type="small" themeColor="textSecondary">
            {caption}
          </ThemedText>
        )}
        <TextField
          placeholder="Phone number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          // Lets iOS offer the SIM's own number from the keyboard bar. The
          // closest thing to reading it automatically — Apple will not hand
          // the number to an app, sign-in with Apple included.
          textContentType="telephoneNumber"
          autoComplete="tel"
        />
        {needsCaptcha && (
          <Turnstile onToken={setCaptchaToken} action="phone-otp" resetSignal={captchaReset} />
        )}
        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}
        <Button label="Send code" onPress={() => void send()} loading={isBusy} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <ThemedText type="small" themeColor="textSecondary">
        Enter the {CODE_LENGTH}-digit code sent to {phone}.
      </ThemedText>
      <CodeInput value={code} onChangeText={setCode} length={CODE_LENGTH} autoFocus />
      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      )}
      <Button
        label="Verify"
        onPress={() => void confirm()}
        loading={isBusy}
        disabled={code.trim().length < CODE_LENGTH}
      />
      <View style={styles.footer}>
        <Pressable
          onPress={() => {
            setStage('number');
            setCode('');
            setError(null);
          }}
          hitSlop={8}
        >
          <ThemedText type="small" themeColor="textSecondary">
            Change number
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => {
            // Back to the number stage for a resend when a challenge is
            // required: the widget lives there, and a resend needs a fresh
            // token exactly as the first send did.
            if (needsCaptcha) {
              setStage('number');
              setCode('');
              setError(null);
              return;
            }
            void send();
          }}
          disabled={cooldown > 0}
          hitSlop={8}
        >
          <ThemedText type="small" themeColor={cooldown > 0 ? 'textSecondary' : 'link'}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.three,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
