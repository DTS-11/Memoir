import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";

export function EmptyState({
  icon = "images-outline",
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={48} color={colors.textTertiary} />
      <Text
        style={[
          typography.title3,
          { color: colors.text, marginTop: 16, textAlign: "center" },
        ]}
      >
        {title}
      </Text>
      {!!body && (
        <Text
          style={[
            typography.body,
            {
              color: colors.textSecondary,
              marginTop: 8,
              textAlign: "center",
              paddingHorizontal: 24,
            },
          ]}
        >
          {body}
        </Text>
      )}
      {!!actionLabel && (
        <Pressable
          onPress={onAction}
          style={[styles.action, { backgroundColor: colors.accent }]}
        >
          {/* accent is black in light / white in dark → background color inverts the text */}
          <Text style={[styles.actionLabel, { color: colors.background }]}>
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  action: {
    marginTop: 20,
    paddingHorizontal: 22,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontWeight: "700",
    fontSize: 15,
  },
});
