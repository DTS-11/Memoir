import { useCallback, useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { GlassView } from './GlassView';
import { useTheme } from '../theme/ThemeProvider';
import { TabIcon, type TabIconName } from './TabIcon';

const iconMap: Record<string, TabIconName> = {
  index: 'library',
  'for-you': 'sparkles',
  albums: 'albums',
  search: 'search',
};

const labelMap: Record<string, string> = {
  index: 'Library',
  'for-you': 'For You',
  albums: 'Albums',
  search: 'Search',
};

// iOS-like spring: snappy but not bouncy.
const TAB_SPRING = { damping: 26, stiffness: 240, mass: 0.9 } as const;

const INDICATOR_INSET = 6;

export function Dock(props: BottomTabBarProps) {
  const { state, navigation, descriptors } = props;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [dockWidth, setDockWidth] = useState(0);
  const focused = useSharedValue(state.index);

  useEffect(() => {
    focused.value = withSpring(state.index, TAB_SPRING);
  }, [state.index, focused]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setDockWidth(e.nativeEvent.layout.width);
  }, []);

  // Each tab gets an equal slice of the dock's measured width. The indicator
  // is one slice wide (minus a small inset on each side) and translates by
  // exactly that slice width per tab — so it always lands perfectly under
  // whichever tab is focused.
  const tabSlice = dockWidth > 0 ? dockWidth / state.routes.length : 0;
  const indicatorWidth = Math.max(0, tabSlice - INDICATOR_INSET * 2);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: focused.value * tabSlice }],
    width: indicatorWidth,
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}
    >
      <GlassView
        intensity={Platform.OS === 'ios' ? 80 : 100}
        bordered
        style={[styles.dock, { borderColor: colors.glassBorder }]}
      >
        <View onLayout={onLayout} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <Animated.View
          style={[
            styles.indicator,
            {
              backgroundColor: isDark
                ? 'rgba(255,255,255,0.10)'
                : 'rgba(0,0,0,0.06)',
            },
            indicatorStyle,
          ]}
        />
        {state.routes.map((route, i) => {
          const isFocused = state.index === i;
          const name = (route.name as string).replace(/^\(.*\)\//, '');
          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              Haptics.selectionAsync();
              navigation.navigate(route.name, route.params);
            }
          };

          const { options } = descriptors[route.key];
          const label =
            (options.tabBarLabel as string) ||
            options.title ||
            labelMap[name] ||
            name;
          const iconName = iconMap[name] ?? 'library';

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
                size={22}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  { color: isFocused ? colors.text : colors.textSecondary },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </GlassView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  dock: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 520,
    height: 64,
    borderRadius: 28,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  indicator: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: INDICATOR_INSET,
    borderRadius: 22,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    zIndex: 1,
  },
  label: {
    fontSize: 10.5,
    fontWeight: '600',
  },
});
