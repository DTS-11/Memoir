import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";
import { PersonCard } from "./PersonCard";
import type { PersonWithCover } from "../hooks/usePeople";
import type { ScanProgress } from "../services/FaceProcessingQueue";

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

  const scanPct =
    progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  // ── Empty / scan prompt ────────────────────────────────────────────────────
  if (persons.length === 0 && !loadingPeople && !isScanning) {
    return (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptyIcon, { backgroundColor: colors.accentMuted }]}>
          <Ionicons name="people" size={28} color={colors.accent} />
        </View>
        <Text style={[typography.headline, { color: colors.text, marginTop: 12 }]}>
          People
        </Text>
        <Text
          style={[
            typography.subhead,
            { color: colors.textSecondary, textAlign: "center", marginTop: 4 },
          ]}
        >
          Memoir can group your photos by the faces it finds, entirely on‑device.
        </Text>
        <Pressable
          onPress={onStartScan}
          style={({ pressed }) => [
            styles.scanBtn,
            { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Ionicons name="scan" size={16} color={colors.background} />
          <Text style={[typography.subhead, { color: colors.background, marginLeft: 6 }]}>
            Scan for People
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      {/* Progress bar while scanning */}
      {isScanning && (
        <View style={[styles.progressContainer, { backgroundColor: colors.surface }]}>
          <ActivityIndicator
            size="small"
            color={colors.accent}
            style={{ marginRight: 8 }}
          />
          <Text style={[typography.subhead, { color: colors.textSecondary, flex: 1 }]}>
            {progress.status === "clustering"
              ? "Grouping faces…"
              : `Scanning… ${scanPct}%`}
          </Text>
          <Pressable onPress={onStopScan} hitSlop={10}>
            <Ionicons name="stop-circle" size={20} color={colors.textTertiary} />
          </Pressable>
        </View>
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
            <ActivityIndicator color={colors.accent} style={{ margin: 24 }} />
          ) : (
            persons.map((p) => (
              <PersonCard key={p.id} person={p} onPress={onPersonPress} />
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
              opacity: pressed ? 0.6 : 1,
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

const styles = StyleSheet.create({
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 22,
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 8,
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
