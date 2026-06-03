import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeProvider';

type Props<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
};

export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  const { colors, isDark } = useTheme();
  const index = options.findIndex((o) => o.value === value);
  const pos = useSharedValue(index < 0 ? 0 : index);

  useEffect(() => {
    pos.value = withSpring(index < 0 ? 0 : index, { damping: 22, stiffness: 240 });
  }, [index, pos]);

  const indicator = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.value * (100 / options.length) + '%' as any }],
  }));

  return (
    <View
      style={[
        styles.track,
        {
          backgroundColor: isDark ? 'rgba(118,118,128,0.24)' : 'rgba(118,118,128,0.12)',
        },
      ]}
    >
      <Animated.View
        style={[
          styles.indicator,
          { width: `${100 / options.length}%`, backgroundColor: colors.surfaceElevated },
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
    flexDirection: 'row',
    borderRadius: 9,
    padding: 2,
    height: 32,
    position: 'relative',
    alignSelf: 'center',
  },
  indicator: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: 2,
    borderRadius: 7,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    zIndex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
});
