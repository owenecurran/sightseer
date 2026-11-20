import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { JourneyLeg, JourneyMode } from '@/lib/journey';

const ICONS: Record<JourneyMode, ComponentProps<typeof Ionicons>['name']> = {
  'same-place': 'location-outline',
  walk: 'walk-outline',
  drive: 'car-outline',
  fly: 'airplane-outline',
  unknown: 'time-outline',
};

// The words beside a route between two postcards: where from and where to,
// then how far, then how long between. Set against the route, so it lines
// up on the side nearest it.
export function JourneyLabel({ leg, align }: { leg: JourneyLeg; align: 'left' | 'right' }) {
  const theme = useTheme();
  const edge = align === 'right' ? styles.toRight : styles.toLeft;
  return (
    <View style={[styles.label, edge]}>
      {leg.places && (
        <ThemedText type="sectionLabel" style={{ textAlign: align }} numberOfLines={2}>
          {leg.places}
        </ThemedText>
      )}
      {leg.distance && (
        <View style={[styles.distance, edge]}>
          <Ionicons name={ICONS[leg.mode]} size={18} color={theme.text} />
          <ThemedText type="lead">{leg.distance}</ThemedText>
        </View>
      )}
      {leg.gap && (
        <ThemedText type="caption" style={{ textAlign: align }}>
          {leg.gap}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    gap: Spacing.half,
  },
  toLeft: {
    alignItems: 'flex-start',
  },
  toRight: {
    alignItems: 'flex-end',
  },
  distance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
