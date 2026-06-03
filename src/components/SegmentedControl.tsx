import { useCallback, useEffect, useState } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "../theme/ThemeProvider";

type Props<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
};

const TRACK_PADDING = 2;
const SPRING = { damping: 26, stiffness: 240, mass: 0.9 } as const;

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: Props<T>) {
  const { colors, isDark } = useTheme();
  const index = options.findIndex((o) => o.value === value);
  const safeIndex = index < 0 ? 0 : index;

  const [trackWidth, setTrackWidth] = useState(0);
  const pos = useSharedValue(safeIndex);

  useEffect(() => {
    pos.value = withSpring(safeIndex, SPRING);
  }, [safeIndex, pos]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  const innerWidth = Math.max(0, trackWidth - TRACK_PADDING * 2);
  const slice = options.length > 0 ? innerWidth / options.length : 0;

  const indicator = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.value * slice }],
    width: slice,
  }));

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.track,
        {
          backgroundColor: isDark
            ? "rgba(118,118,128,0.24)"
            : "rgba(118,118,128,0.12)",
        },
      ]}
    >
      <Animated.View
        style={[
          styles.indicator,
          { backgroundColor: colors.surfaceElevated },
          indicator,
        ]}
      />
      {options.map((o) => (
        <Pressable
          key={o.value}
          style={styles.option}
          onPress={() => {
            if (o.value !== value) {
              Haptics.selectionAsync();
              onChange(o.value);
            }
          }}
        >
          <Text
            style={[
              styles.label,
              { color: o.value === value ? colors.text : colors.textSecondary },
            ]}
          >
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    borderRadius: 10,
    padding: TRACK_PADDING,
    height: 34,
    position: "relative",
    alignSelf: "center",
  },
  indicator: {
    position: "absolute",
    top: TRACK_PADDING,
    bottom: TRACK_PADDING,
    left: TRACK_PADDING,
    borderRadius: 8,
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)",
  },
  option: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    zIndex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
});
