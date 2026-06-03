import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView } from './GlassView';
import { useTheme } from '../theme/ThemeProvider';

export function TopGlassBar({
  title,
  subtitle,
  right,
  intensity = 70,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  intensity?: number;
}) {
  const insets = useSafeAreaInsets();
  const { colors, typography } = useTheme();

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
          <Text style={[typography.title1, { color: colors.text }]}>{title}</Text>
          {!!subtitle && (
            <Text style={[typography.subhead, { color: colors.textSecondary, marginTop: 2 }]}>
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
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
});
