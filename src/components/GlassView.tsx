import { BlurView } from 'expo-blur';
import { type ViewStyle, type StyleProp, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

type Props = {
  intensity?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  bordered?: boolean;
};

/**
 * Frosted glass surface. On Android we opt into expo-blur's dimezisBlurView
 * backend, which is dramatically cheaper than the default and the reason
 * scrolling underneath the dock used to drop frames.
 *
 * `borderCurve: 'continuous'` is a no-op on Android but gives proper iOS
 * squircle corners on iOS — matching the platform's own rounded surfaces.
 */
export function GlassView({ intensity = 70, style, children, bordered }: Props) {
  const { mode, colors } = useTheme();
  return (
    <BlurView
      intensity={intensity}
      tint={mode === 'dark' ? 'dark' : 'light'}
      experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'}
      style={[
        styles.base,
        { backgroundColor: colors.glassTint, borderColor: colors.glassBorder },
        bordered && styles.bordered,
        style,
      ]}
    >
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    // iOS-only property — Android ignores. Renders proper Apple squircle corners.
    borderCurve: 'continuous',
  },
  bordered: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
