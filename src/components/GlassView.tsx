import { BlurView } from "expo-blur";
import {
  GlassView as NativeGlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { type ViewStyle, type StyleProp, Platform, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

type Props = {
  intensity?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  bordered?: boolean;
  interactive?: boolean;
};

export function GlassView({
  intensity = 70,
  style,
  children,
  bordered,
  interactive,
}: Props) {
  const { mode, colors } = useTheme();

  if (Platform.OS === "ios" && isLiquidGlassAvailable() && isGlassEffectAPIAvailable()) {
    return (
      <NativeGlassView
        colorScheme={mode}
        glassEffectStyle="regular"
        isInteractive={interactive}
        tintColor={colors.glassTint}
        style={[styles.base, bordered && styles.bordered, style]}
      >
        {children}
      </NativeGlassView>
    );
  }

  return (
    <BlurView
      intensity={intensity}
      tint={mode === "dark" ? "dark" : "light"}
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
    overflow: "hidden",
    borderCurve: "continuous", // squircle corners on iOS; no-op on Android
  },
  bordered: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
