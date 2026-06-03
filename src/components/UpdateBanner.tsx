import { useEffect } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { GlassView } from './GlassView';
import { useTheme } from '../theme/ThemeProvider';
import { useAppUpdate } from '../hooks/useAppUpdate';

export function UpdateBanner() {
  const insets = useSafeAreaInsets();
  const { colors, typography } = useTheme();
  const { update, dismiss } = useAppUpdate();

  const translateY = useSharedValue(-120);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (update) {
      translateY.value = withSpring(0, { damping: 24, stiffness: 220, mass: 0.9 });
      opacity.value = withTiming(1, { duration: 220 });
    } else {
      translateY.value = withTiming(-120, { duration: 200 });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [update, translateY, opacity]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!update) return null;

  const open = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = update.apkUrl || update.releaseUrl;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrapper, { paddingTop: insets.top + 8 }, style]}
    >
      <GlassView intensity={70} bordered style={[styles.card, { borderColor: colors.glassBorder }]}>
        <View style={[styles.iconWrap, { backgroundColor: colors.accentMuted }]}>
          <Ionicons name="arrow-down-circle" size={22} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.subhead, { color: colors.text }]} numberOfLines={1}>
            Memoir {update.latestVersion} is available
          </Text>
          <Text style={[typography.caption1, { color: colors.textSecondary }]} numberOfLines={1}>
            Tap to download the update
          </Text>
        </View>
        <Pressable onPress={open} hitSlop={8} style={[styles.cta, { backgroundColor: colors.accent }]}>
          <Text style={styles.ctaLabel}>Update</Text>
        </Pressable>
        <Pressable onPress={dismiss} hitSlop={10} style={styles.dismiss}>
          <Ionicons name="close" size={18} color={colors.textSecondary} />
        </Pressable>
      </GlassView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: 14,
    zIndex: 50,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    paddingLeft: 12,
    borderRadius: 20,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cta: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  dismiss: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
