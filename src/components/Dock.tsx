import { useEffect } from "react";
import { emitTabScrollToTop } from "../hooks/useTabScrollToTop";
import { Pressable, StyleSheet, View, Platform } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "expo-router/tabs";
import { GlassView } from "./GlassView";
import { useTheme } from "../theme/ThemeProvider";
import { TabIcon, type TabIconName } from "./TabIcon";

const iconMap: Record<string, TabIconName> = {
  index: "library",
  albums: "albums",
};

const TAB_SPRING = { damping: 26, stiffness: 240, mass: 0.9 } as const;

// Width of each icon slot inside the pill.
const SLOT = 64;
const INDICATOR_INSET = 6;

export function Dock(props: BottomTabBarProps) {
  const { state, navigation } = props;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const visibleRoutes = state.routes.filter((r) => {
    const name = (r.name as string).replace(/^\(.*\)\//, "");
    return name in iconMap;
  });
  const focusedVisibleIdx = Math.max(
    0,
    visibleRoutes.findIndex((r) => r.key === state.routes[state.index]?.key),
  );

  const focused = useSharedValue(focusedVisibleIdx);

  useEffect(() => {
    focused.value = withSpring(focusedVisibleIdx, TAB_SPRING);
  }, [focusedVisibleIdx, focused]);

  const pillWidth = SLOT * visibleRoutes.length;
  const indicatorWidth = SLOT - INDICATOR_INSET * 2;

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: focused.value * SLOT }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}
    >
      <GlassView
        intensity={Platform.OS === "ios" ? 80 : 100}
        bordered
        interactive
        style={[styles.dock, { borderColor: colors.glassBorder, width: pillWidth }]}
      >
        <Animated.View
          style={[
            styles.indicator,
            {
              backgroundColor: isDark ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.07)",
              width: indicatorWidth,
            },
            indicatorStyle,
          ]}
        />
        {visibleRoutes.map((route, i) => {
          const isFocused = focusedVisibleIdx === i;
          const name = (route.name as string).replace(/^\(.*\)\//, "");

          const onPress = () => {
            if (isFocused) {
              Haptics.selectionAsync();
              emitTabScrollToTop(name);
              return;
            }
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!event.defaultPrevented) {
              Haptics.selectionAsync();
              navigation.navigate(route.name, route.params);
            }
          };

          const iconName = iconMap[name] ?? "library";

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              onPress={onPress}
              style={styles.tab}
              hitSlop={8}
            >
              <TabIcon
                name={iconName}
                color={isFocused ? colors.text : colors.textSecondary}
                size={23}
              />
            </Pressable>
          );
        })}
      </GlassView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  dock: {
    flexDirection: "row",
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    position: "relative",
    boxShadow: "0 8px 28px rgba(0, 0, 0, 0.22)",
  },
  indicator: {
    position: "absolute",
    top: INDICATOR_INSET,
    bottom: INDICATOR_INSET,
    left: INDICATOR_INSET,
    borderRadius: 22,
  },
  tab: {
    width: SLOT,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
});
