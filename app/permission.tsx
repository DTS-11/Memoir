import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as MediaLibrary from "expo-media-library/legacy";
import { Linking } from "react-native";
import { useTheme } from "../src/theme/ThemeProvider";
import { GlassView } from "../src/components/GlassView";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function PermissionScreen() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();

  const handleAllow = async () => {
    const res = await MediaLibrary.requestPermissionsAsync(false);
    if (res.status === "granted" || res.accessPrivileges === "limited") {
      router.back();
    } else if (!res.canAskAgain) {
      Linking.openSettings();
    }
  };

  return (
    <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
      <GlassView
        intensity={90}
        bordered
        style={[styles.card, { marginTop: insets.top + 80 }]}
      >
        <View
          style={[styles.iconWrap, { backgroundColor: colors.accentMuted }]}
        >
          <Ionicons name="images" size={36} color={colors.accent} />
        </View>
        <Text
          style={[
            typography.title2,
            { color: colors.text, textAlign: "center", marginTop: 16 },
          ]}
        >
          Show your memories
        </Text>
        <Text
          style={[
            typography.body,
            {
              color: colors.textSecondary,
              textAlign: "center",
              marginTop: 8,
              paddingHorizontal: 12,
            },
          ]}
        >
          Memoir needs access to your photos to build a beautiful gallery from
          your library. Nothing leaves your device.
        </Text>

        <Pressable
          onPress={handleAllow}
          style={[styles.primary, { backgroundColor: colors.accent }]}
        >
          <Text style={styles.primaryLabel}>Allow Access</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={styles.secondary}>
          <Text style={[typography.subhead, { color: colors.textSecondary }]}>
            Not now
          </Text>
        </Pressable>
      </GlassView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    marginTop: 24,
    width: "100%",
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryLabel: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 16,
  },
  secondary: {
    marginTop: 12,
    paddingVertical: 8,
  },
});
