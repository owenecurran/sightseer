import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { RatingGlassBadgeGated } from '@/components/ui/rating-glass-badge-gated';
import { RatingSlider } from '@/components/ui/rating-slider';
import { Spacing } from '@/constants/theme';

type RatingSliderWithPreviewProps = {
  value: number | null;
  onChange: (value: number) => void;
  // Bigger by default than the inline feed/list stamps — this one stands
  // alone as the main focus of its own section, not a small badge next to
  // other content.
  previewSize?: number;
};

// RatingSlider itself, with the stamp preview taking over its plain
// numeric readout's own slot (rather than sitting as a second, separate
// element below it) — every "adjusting a rating" screen in the app (a
// fresh review, editing one, a travel book's trip rating, a trip recap)
// wants to show what the actual stamp will look like, not a bare number.
// No throttling needed: RatingSlider's onChange already only actually
// fires on real 0.1-step changes (see its own updateFromTrackX), and
// RatingGlassBadge's frame/icon paths are memoized independent of the
// rating value (only the fill color and the number text change per
// render), so re-rendering this on every step during a drag is cheap.
// Falls back to RatingSlider's own "Rate it" prompt while unset — the
// stamp only takes over once there's a real value to show, same "no
// numeric readout until the first real value" rule RatingSlider itself
// already followed.
export function RatingSliderWithPreview({ value, onChange, previewSize = 64 }: RatingSliderWithPreviewProps) {
  return (
    <View style={styles.wrap}>
      {value != null ? (
        <View style={styles.preview}>
          <RatingGlassBadgeGated rating={value} size={previewSize} />
        </View>
      ) : (
        <ThemedText type="title" style={styles.placeholder}>
          Rate it
        </ThemedText>
      )}
      <RatingSlider value={value} onChange={onChange} showValueText={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.two,
  },
  preview: {
    alignItems: 'center',
  },
  placeholder: {
    textAlign: 'center',
  },
});
