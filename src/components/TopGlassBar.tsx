import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView } from './GlassView';
import { useTheme } from '../theme/ThemeProvider';

export function TopGlassBar({
  title,
  subtitle,
  right,
  intensity = 80,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  intensity?: number;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <GlassView
      intensity={intensity}
      style={[
        styles.bar,
        {
          paddingTop: insets.top + 6,
          borderBottomColor: colors.glassBorder,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          {!!subtitle && (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        {right}
      </View>
    </GlassView>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  // iOS 18-style heavier, slightly tighter title.
  title: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
    letterSpacing: -0.1,
  },
});
