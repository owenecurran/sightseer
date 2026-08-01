import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { Spacing } from '@/constants/theme';

type UserRowProps = {
  name: string | null;
  handle: string | null;
  avatarUrl?: string | null;
  onPress?: () => void;
  trailing?: ReactNode;
};

export function UserRow({ name, handle, avatarUrl, onPress, trailing }: UserRowProps) {
  const content = (
    <ThemedView type="backgroundElement" style={styles.row}>
      <Avatar uri={avatarUrl} name={name ?? handle} size={40} />
      <View style={styles.info}>
        <ThemedText type="default">{name ?? handle ?? 'Someone'}</ThemedText>
        {handle && (
          <ThemedText type="small" themeColor="textSecondary">
            @{handle}
          </ThemedText>
        )}
      </View>
      {trailing}
    </ThemedView>
  );

  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  info: {
    flex: 1,
    gap: Spacing.half,
  },
});
