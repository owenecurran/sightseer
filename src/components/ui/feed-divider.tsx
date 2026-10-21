import { StyleSheet, View } from 'react-native';

import { BrandColors } from '@/constants/theme';

// A tear line between posts.
//
// The feed ran one card straight into the next with nothing but a gap, so
// where one review ended and the next began was a judgement about spacing.
// This is the same perforation the tickets on the Create screen are torn
// along, which is the language the rest of the app already speaks: the cards
// are postcards, and what separates them is a line you could tear.
//
// DOTS RATHER THAN A DASHED BORDER. `borderStyle: 'dashed'` renders solid on
// Android often enough that it cannot be relied on, and the dash length is
// not controllable anyway. A fixed count of dots spread across the width
// looks identical on both platforms and costs one flex row.
const DOT_COUNT = 28;
const DOT_SIZE = 2;

export function FeedDivider() {
  return (
    <View style={styles.row} pointerEvents="none">
      {Array.from({ length: DOT_COUNT }, (_, i) => (
        <View key={i} style={styles.dot} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // Most of the breathing room between two cards belongs to the line, not
    // to the cards — a rule crowded against a card reads as part of it.
    marginVertical: 18,
    paddingHorizontal: 8,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    // Faint. This is punctuation between posts, not a piece of furniture in
    // its own right, and the cards either side carry all the contrast.
    backgroundColor: `${BrandColors.cream}26`,
  },
});
