import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePhotos, type Photo } from "../src/hooks/usePhotos";
import { useTheme } from "../src/theme/ThemeProvider";
import { PhotoThumb } from "../src/components/PhotoThumb";
import { EmptyState } from "../src/components/EmptyState";
import type { GridItem } from "../src/utils/grouping";
import { buildGrid } from "../src/utils/grouping";
import { photoToParams } from "../src/utils/photoParams";

const COLS = 3;

type GateState = "checking" | "locked" | "unlocked";

export default function HiddenScreen() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { hiddenPhotos, unhidePhoto, hidePhotosBulk, deleteForeverBulk } = usePhotos();
  const listRef = useRef<FlashListRef<GridItem> | null>(null);
  const [tileWidth, setTileWidth] = useState(0);
  const [gate, setGate] = useState<GateState>("checking");
  const [noBiometric, setNoBiometric] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const items = useMemo(() => buildGrid(hiddenPhotos, "all"), [hiddenPhotos]);

  const tryUnlock = useCallback(async () => {
    setGate("checking");
    setNoBiometric(false);
    const hasHardware = await LocalAuthentication.hasHardwareAsync().catch(() => false);
    const enrolled = await LocalAuthentication.isEnrolledAsync().catch(() => false);
    if (!hasHardware) {
      setNoBiometric(true);
      setGate("locked");
      return;
    }
    if (!enrolled) {
      setNoBiometric(true);
      setGate("locked");
      return;
    }
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock Hidden",
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });
    setGate(res.success ? "unlocked" : "locked");
  }, []);

  useEffect(() => {
    tryUnlock();
  }, [tryUnlock]);

  const onPressPhoto = useCallback((p: Photo) => {
    router.push({ pathname: "/photo/[id]", params: { ...photoToParams(p) } });
  }, []);

  const toggleSelect = useCallback((photo: Photo) => {
    Haptics.selectionAsync();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photo.id)) next.delete(photo.id);
      else next.add(photo.id);
      return next;
    });
  }, []);

  const enterSelect = useCallback((photo: Photo) => {
    setSelecting(true);
    setSelectedIds(new Set([photo.id]));
    Haptics.selectionAsync();
  }, []);

  const cancelSelect = useCallback(() => {
    setSelecting(false);
    setSelectedIds(new Set());
  }, []);

  const unhideSelected = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    ids.forEach((id) => unhidePhoto(id));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    cancelSelect();
  }, [selectedIds, unhidePhoto, cancelSelect]);

  const deleteSelected = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    Alert.alert(
      `Delete ${ids.length} item${ids.length === 1 ? "" : "s"}?`,
      "They'll be moved to Recently Deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteForeverBulk(ids);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            cancelSelect();
          },
        },
      ],
    );
  }, [selectedIds, deleteForeverBulk, cancelSelect]);

  const overrideItemLayout = useCallback((layout: { span?: number }, item: GridItem) => {
    if (item.type === "header") layout.span = COLS;
  }, []);

  const contentContainerStyle = useMemo(
    () => ({ paddingBottom: insets.bottom + 110 }),
    [insets.bottom],
  );

  const renderItem = useCallback(
    ({ item }: { item: GridItem }) => {
      if (item.type === "header") {
        return (
          <View style={styles.sectionHeader}>
            <Text style={[typography.subhead, { color: colors.textSecondary }]}>
              {item.title}
            </Text>
          </View>
        );
      }
      const photo = item.photo;
      return (
        <PhotoThumb
          photo={photo}
          size={tileWidth || 120}
          onPress={selecting ? toggleSelect : onPressPhoto}
          onLongPress={selecting ? undefined : enterSelect}
          selected={selectedIds.has(photo.id)}
          inSelectMode={selecting}
        />
      );
    },
    [
      tileWidth,
      selecting,
      selectedIds,
      toggleSelect,
      onPressPhoto,
      enterSelect,
      colors,
      typography,
    ],
  );

  if (gate === "checking") {
    return (
      <View
        style={[
          styles.fill,
          {
            backgroundColor: colors.background,
            alignItems: "center",
            justifyContent: "center",
          },
        ]}
      >
        <Ionicons name="lock-closed-outline" size={44} color={colors.textTertiary} />
      </View>
    );
  }

  if (gate === "locked") {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + 10,
              backgroundColor: colors.background,
              borderBottomColor: colors.separator,
            },
          ]}
        >
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerSide}>
            <Ionicons name="chevron-back" size={24} color={colors.accent} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={[typography.headline, { color: colors.text }]}>Hidden</Text>
          </View>
          <View style={styles.headerSide} />
        </View>
        <View style={styles.lockWrap}>
          <Ionicons name="eye-off-outline" size={52} color={colors.textTertiary} />
          <Text style={[typography.title3, { color: colors.text, marginTop: 16 }]}>
            Hidden Photos
          </Text>
          <Text
            style={[
              typography.body,
              {
                color: colors.textSecondary,
                marginTop: 8,
                textAlign: "center",
                paddingHorizontal: 40,
              },
            ]}
          >
            {noBiometric
              ? "Set up a fingerprint or face unlock on this device to protect this album."
              : "Unlock with your device's fingerprint or face to view hidden photos."}
          </Text>
          <Pressable
            onPress={tryUnlock}
            style={[styles.unlockBtn, { backgroundColor: colors.accent }]}
          >
            <Ionicons name="finger-print" size={20} color={colors.background} />
            <Text
              style={[
                typography.subhead,
                { color: colors.background, fontWeight: "700", marginLeft: 8 },
              ]}
            >
              Unlock
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.fill, { backgroundColor: colors.background }]}
      onLayout={(e) => setTileWidth(e.nativeEvent.layout.width / COLS)}
    >
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 10,
            backgroundColor: colors.background,
            borderBottomColor: colors.separator,
          },
        ]}
      >
        {selecting ? (
          <>
            <Pressable onPress={cancelSelect} hitSlop={12} style={styles.headerSide}>
              <Text style={[typography.body, { color: colors.accent }]}>Cancel</Text>
            </Pressable>
            <View style={styles.headerCenter}>
              <Text style={[typography.headline, { color: colors.text }]}>
                {selectedIds.size > 0 ? `${selectedIds.size} Selected` : "Select Items"}
              </Text>
            </View>
            <Pressable
              onPress={() =>
                setSelectedIds(
                  selectedIds.size === hiddenPhotos.length
                    ? new Set()
                    : new Set(hiddenPhotos.map((p) => p.id)),
                )
              }
              hitSlop={12}
              style={styles.headerSide}
            >
              <Text
                style={[typography.body, { color: colors.accent, textAlign: "right" }]}
              >
                {selectedIds.size === hiddenPhotos.length ? "None" : "All"}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={styles.headerSide}
            >
              <Ionicons name="chevron-back" size={24} color={colors.accent} />
            </Pressable>
            <View style={styles.headerCenter}>
              <Text style={[typography.headline, { color: colors.text }]}>Hidden</Text>
              {hiddenPhotos.length > 0 && (
                <Text
                  style={[
                    typography.footnote,
                    { color: colors.textSecondary, marginTop: 1 },
                  ]}
                >
                  {hiddenPhotos.length} item{hiddenPhotos.length === 1 ? "" : "s"}
                </Text>
              )}
            </View>
            <View style={styles.headerSide} />
          </>
        )}
      </View>

      {hiddenPhotos.length === 0 ? (
        <EmptyState
          icon="eye-off-outline"
          title="No Hidden Photos"
          body="Photos you hide disappear from your library and land here, protected by your device lock."
        />
      ) : (
        <FlashList
          ref={listRef}
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          numColumns={COLS}
          contentContainerStyle={contentContainerStyle}
          getItemType={(item) => item.type}
          overrideItemLayout={overrideItemLayout}
        />
      )}

      {selecting && (
        <View
          style={[
            styles.actionBar,
            { bottom: insets.bottom + 16, backgroundColor: colors.surfaceElevated },
          ]}
        >
          <ActionBtn
            icon="eye-outline"
            label="Unhide"
            onPress={unhideSelected}
            disabled={selectedIds.size === 0}
            color={colors.text}
          />
          <ActionBtn
            icon="trash-outline"
            label="Delete"
            onPress={deleteSelected}
            disabled={selectedIds.size === 0}
            color={selectedIds.size > 0 ? "#FF453A" : colors.textTertiary}
          />
        </View>
      )}
    </View>
  );
}

function ActionBtn({
  icon,
  label,
  onPress,
  disabled,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.actionBtn,
        disabled && { opacity: 0.35 },
        pressed && { opacity: 0.55 },
      ]}
    >
      <Ionicons name={icon} size={24} color={color} />
      <Text style={[styles.actionLabel, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSide: {
    width: 72,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  lockWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  unlockBtn: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    height: 48,
    borderRadius: 24,
  },
  actionBar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 10,
    borderRadius: 22,
    borderCurve: "continuous",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  actionBtn: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 18,
    paddingVertical: 4,
    minWidth: 80,
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
});
