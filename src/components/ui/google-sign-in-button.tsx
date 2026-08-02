import { useState } from 'react';
import { Platform } from 'react-native';

import { Button } from '@/components/ui/button';
import { signInWithGoogle } from '@/lib/social-auth';

type GoogleSignInButtonProps = {
  onError: (message: string) => void;
};

// Native (iOS/Android) implementation — see google-sign-in-button.web.tsx for
// the web sibling, which the bundler resolves automatically for web builds.
export function GoogleSignInButton({ onError }: GoogleSignInButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (Platform.OS === 'web') return null;

  async function handlePress() {
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not sign in with Google.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Button label="Continue with Google" variant="secondary" onPress={handlePress} loading={isSubmitting} />
  );
}
