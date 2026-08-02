import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AppleSignInButton } from '@/components/ui/apple-sign-in-button';
import { GoogleSignInButton } from '@/components/ui/google-sign-in-button';
import { Spacing } from '@/constants/theme';

type SocialAuthButtonsProps = {
  onError: (message: string) => void;
};

export function SocialAuthButtons({ onError }: SocialAuthButtonsProps) {
  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.divider}>
        or
      </ThemedText>
      <AppleSignInButton onError={onError} />
      <GoogleSignInButton onError={onError} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  divider: {
    textAlign: 'center',
  },
});
