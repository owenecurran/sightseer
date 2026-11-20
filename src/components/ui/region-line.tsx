import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { RegionTreatment } from '@/lib/headline-style';

type RegionLineProps = {
  children: string;
  treatment: RegionTreatment;
};

// The "state, country" line set across a postcard's photograph, with its
// outline.
//
// LayeredHeadline's construction at the size of a caption: the outline is the
// same line drawn again in the opposite ink, once per plate, behind the front
// copy. Every copy is handed the same box shifted by left/right and top/bottom
// in pairs, so each one truncates at the same character and the ellipsis
// registers along with the letters.
export function RegionLine({ children, treatment }: RegionLineProps) {
  return (
    <View>
      {treatment.back.map((plate, index) => (
        <ThemedText
          key={index}
          numberOfLines={1}
          style={[
            treatment.style,
            styles.plate,
            {
              color: plate.color,
              left: plate.dx,
              right: -plate.dx,
              top: plate.dy,
              bottom: -plate.dy,
            },
          ]}>
          {children}
        </ThemedText>
      ))}
      <ThemedText numberOfLines={1} style={treatment.style}>
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    position: 'absolute',
  },
});
