import { LinearGradient } from 'expo-linear-gradient';
import { View, type ViewProps } from 'react-native';

import { GradientColors, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemeColor | 'screen';
};

// `type="screen"` is the one exception to the flat theme-color lookup below —
// it's the diagonal brand gradient, reserved for each screen's single
// outermost wrapper (not nested cards/boxes, which stay flat via the regular
// `background` theme color) so the gradient doesn't repeat inside every box.
export function ThemedView({ style, lightColor, darkColor, type, ...otherProps }: ThemedViewProps) {
  const theme = useTheme();

  if (type === 'screen') {
    return (
      <LinearGradient
        colors={[GradientColors.screenStart, GradientColors.screenEnd]}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={style}
        {...otherProps}
      />
    );
  }

  return <View style={[{ backgroundColor: theme[type ?? 'background'] }, style]} {...otherProps} />;
}
