import React, { useCallback, useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../theme/ThemeProvider";
import { semantic } from "../theme/tokens";
import { GlassView } from "./GlassView";
import { PersonCard } from "./PersonCard";
import type { PersonWithCover } from "../hooks/usePeople";
import type { ScanProgress } from "../services/FaceProcessingQueue";

const HERO_GRADIENT = ["#7C6CF0", "#4B7BEC"] as const;
const PRESS_SPRING = { damping: 20, stiffness: 320, mass: 0.8 } as const;
const RELEASE_SPRING = { damping: 16, stiffness: 220, mass: 0.8 } as const;

type Props = {
  persons: PersonWithCover[];
  loadingPeople: boolean;
  progress: ScanProgress;
  onStartScan: () => void;
  onStopScan: () => void;
  onPersonPress: (person: PersonWithCover) => void;
};

export function PeopleSection({
  persons,
  loadingPeople,
  progress,
  onStartScan,
  onStopScan,
  onPersonPress,
}: Props) {
  const { colors, typography } = useTheme();
  const isScanning = progress.status === "scanning" || progress.status === "clustering";
  const showFeedback = isScanning || progress.status === "up_to_date";

  const scanPct =
    progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  // ── Error state ─────────────────────────────────────────────────────────────
  if (progress.status === "error") {
    return (
      <Animated.View entering={FadeInDown.springify().damping(18)}>
        <GlassView intensity={70} bordered style={styles.errorCard}>
          <View style={styles.errorRow}>
            <View style={[styles.errorIcon, { backgroundColor: semantic.deleteMuted }]}>
              <Ionicons name="alert-circle-outline" size={22} color={semantic.delete} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typography.headline, { color: colors.text }]}>
                Face scanning couldn't start
              </Text>
              <Text
                style={[
                  typography.footnote,
                  { color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
                ]}
              >
                {progress.errorMessage ?? "Something went wrong on this device."}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={onStartScan}
            style={({ pressed }) => [
              styles.errorRetry,
              { backgroundColor: colors.accent, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Text style={[typography.footnote, { color: colors.background }]}>
              Try again
            </Text>
          </Pressable>
        </GlassView>
      </Animated.View>
    );
  }

  // ── Empty / scan prompt ────────────────────────────────────────────────────
  if (persons.length === 0 && !loadingPeople && !isScanning) {
    return (
      <Animated.View
        entering={FadeInDown.springify().damping(18)}
        style={styles.emptyWrap}
      >
        <GlassView intensity={70} bordered style={styles.heroCard}>
          <LinearGradient
            colors={[...HERO_GRADIENT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroIcon}
          >
            <Ionicons name="people" size={30} color="#FFFFFF" />
          </LinearGradient>
          <Text style={[typography.title3, { color: colors.text, marginTop: 14 }]}>
            People
          </Text>
          <Text
            style={[
              typography.subhead,
              { color: colors.textSecondary, textAlign: "center", marginTop: 4 },
            ]}
          >
            Memoir can group your photos by the faces it finds — entirely on your device.
          </Text>
          <ScanButton onPress={onStartScan} />
        </GlassView>
      </Animated.View>
    );
  }

  return (
    <View>
      {/* Progress bar while scanning (and the brief "up to date" result) */}
      {showFeedback && (
        <ScanProgressRow progress={progress} scanPct={scanPct} onStopScan={onStopScan} />
      )}

      {/* Horizontal scroll of people */}
      {(persons.length > 0 || loadingPeople) && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          contentContainerStyle={styles.scrollContent}
          style={styles.scroll}
        >
          {loadingPeople && persons.length === 0 ? (
            <Animated.View
              entering={FadeInDown.springify().damping(18)}
              style={{ padding: 24 }}
            >
              <Ionicons name="sync" size={22} color={colors.textTertiary} />
            </Animated.View>
          ) : (
            persons.map((p, i) => (
              <Animated.View
                key={p.id}
                entering={FadeInDown.springify()
                  .damping(20)
                  .delay(Math.min(i * 50, 400))}
              >
                <PersonCard person={p} onPress={onPersonPress} />
              </Animated.View>
            ))
          )}
        </ScrollView>
      )}

      {/* Scan button shown alongside results (for re-scanning) */}
      {persons.length > 0 && !isScanning && (
        <Pressable
          onPress={onStartScan}
          style={({ pressed }) => [
            styles.rescanRow,
            {
              borderTopColor: colors.separator,
              opacity: pressed ? 0.55 : 1,
            },
          ]}
        >
          <Ionicons name="refresh" size={14} color={colors.textTertiary} />
          <Text
            style={[typography.caption1, { color: colors.textTertiary, marginLeft: 4 }]}
          >
            Scan new photos
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function ScanButton({ onPress }: { onPress: () => void }) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pressIn = useCallback(() => {
    scale.value = withSpring(0.95, PRESS_SPRING);
  }, [scale]);

  const pressOut = useCallback(() => {
    scale.value = withSpring(1, RELEASE_SPRING);
  }, [scale]);

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={({ pressed }) => [styles.scanBtnWrap, pressed && { opacity: 0.92 }]}
      >
        <LinearGradient
          colors={[...HERO_GRADIENT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.scanBtn}
        >
          <Ionicons name="scan" size={17} color="#FFFFFF" />
          <Text style={styles.scanBtnText}>Scan for People</Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

function ScanProgressRow({
  progress,
  scanPct,
  onStopScan,
}: {
  progress: ScanProgress;
  scanPct: number;
  onStopScan: () => void;
}) {
  const { colors, typography } = useTheme();
  const barWidth = useSharedValue(0);

  useEffect(() => {
    barWidth.value = withTiming(scanPct, { duration: 320 });
  }, [scanPct, barWidth]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value}%`,
  }));

  const isScanning = progress.status === "scanning" || progress.status === "clustering";

  const label =
    progress.status === "clustering"
      ? "Grouping faces…"
      : progress.status === "up_to_date"
        ? "No new photos — everything is scanned"
        : `Scanning… ${scanPct}%`;

  return (
    <GlassView intensity={70} bordered style={styles.progressContainer}>
      <View style={styles.progressTop}>
        <Animated.View entering={FadeInDown.springify().damping(20)}>
          <Ionicons
            name={progress.status === "up_to_date" ? "checkmark-circle" : "sparkles"}
            size={18}
            color={colors.accent}
          />
        </Animated.View>
        <Text style={[typography.subhead, { color: colors.text, flex: 1 }]}>{label}</Text>
        {isScanning && (
          <Pressable onPress={onStopScan} hitSlop={10}>
            <Ionicons name="stop-circle" size={22} color={colors.textTertiary} />
          </Pressable>
        )}
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.accentMuted }]}>
        <Animated.View
          style={[styles.progressFill, { backgroundColor: colors.accent }, barStyle]}
        />
      </View>
    </GlassView>
  );
}

const styles = StyleSheet.create({
  emptyWrap: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  heroCard: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 24,
    borderRadius: 24,
    borderCurve: "continuous",
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4B7BEC",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  scanBtnWrap: {
    marginTop: 18,
    borderRadius: 999,
    shadowColor: "#4B7BEC",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
  },
  scanBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  progressContainer: {
    marginBottom: 8,
    borderRadius: 18,
    borderCurve: "continuous",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  progressTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  errorCard: {
    marginHorizontal: 20,
    marginVertical: 8,
    borderRadius: 20,
    borderCurve: "continuous",
    padding: 16,
    gap: 14,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  errorIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  errorRetry: {
    alignSelf: "flex-start",
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
  },
  scroll: {
    marginHorizontal: -16,
  },
  scrollContent: {
    paddingHorizontal: 12,
    gap: 4,
  },
  rescanRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
});
