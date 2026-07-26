import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type AvatarProps = {
  uri?: string | null;
  name?: string | null;
  size?: number;
};

export function Avatar({ uri, name, size = 32 }: AvatarProps) {
  const circleStyle = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return <Image source={{ uri }} style={circleStyle} />;
  }

  const initial = name?.trim()?.[0]?.toUpperCase() ?? '?';
  return (
    <ThemedView type="backgroundElement" style={[circleStyle, styles.fallback]}>
      <ThemedText type="smallBold">{initial}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
