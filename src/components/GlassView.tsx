import { BlurView } from 'expo-blur';
import { type ViewStyle, type StyleProp, View, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

type Props = {
  intensity?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  bordered?: boolean;
};

export function GlassView({ intensity = 70, style, children, bordered }: Props) {
  const { mode, colors } = useTheme();
  return (
    <BlurView
      intensity={intensity}
      tint={mode === 'dark' ? 'dark' : 'light'}
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
  },
  bordered: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
