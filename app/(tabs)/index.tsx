import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-worklets";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { usePhotos, type Photo } from "../../src/hooks/usePhotos";
import { useTheme } from "../../src/theme/ThemeProvider";
import { PhotoGrid } from "../../src/components/PhotoGrid";
import { GlassView } from "../../src/components/GlassView";
import { SegmentedControl } from "../../src/components/SegmentedControl";
import { TopGlassBar } from "../../src/components/TopGlassBar";
import { EmptyState } from "../../src/components/EmptyState";
import {
  clampZoom,
  DEFAULT_ZOOM,
  familyForZoom,
  zoomForFamily,
  zoomIn as zoomInLevel,
  zoomOut as zoomOutLevel,
  type LayoutFamily,
  type ZoomLevel,
} from "../../src/utils/grouping";
import { addTabScrollToTopListener } from "../../src/hooks/useTabScrollToTop";
import type { FlashListRef } from "@shopify/flash-list";
import type { GridItem } from "../../src/utils/grouping";

const familyOptions: { value: LayoutFamily; label: string }[] = [
  { value: "years", label: "Years" },
  { value: "months", label: "Months" },
  { value: "days", label: "Days" },
  { value: "all", label: "All Photos" },
];

const TOOLBAR_HEIGHT = 56;
const SPRING = { damping: 22, stiffness: 280, mass: 0.8 } as const;

export default function Library() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    permission,
    photos,
    totalCount,
    requestPermission,
    loadMore,
    favoriteIds,
    setFavoritesBulk,
    moveToRecentlyDeletedBulk,
    archivePhotosBulk,
  } = usePhotos();

  const [zoom, setZoom] = useState<ZoomLevel>(DEFAULT_ZOOM);
  const [inSelectMode, setInSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const gridRef = useRef<FlashListRef<GridItem> | null>(null);
  const toolbarOffset = useSharedValue(TOOLBAR_HEIGHT + 20);

  // ── scroll to top ────────────────────────────────────────────────────────────
  useEffect(() => {
    return addTabScrollToTopListener("index", () => {
      gridRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
  }, []);

  // ── toolbar slide animation ───────────────────────────────────────────────────
  useEffect(() => {
    toolbarOffset.value = withSpring(
      inSelectMode ? 0 : TOOLBAR_HEIGHT + 20,
      SPRING,
    );
  }, [inSelectMode, toolbarOffset]);

  // ── zoom ─────────────────────────────────────────────────────────────────────
  const setFamily = useCallback((f: LayoutFamily) => {
    setZoom((prev) => {
      const next = zoomForFamily(f);
      if (familyForZoom(prev) !== f) Haptics.selectionAsync();
      return next;
    });
  }, []);

  const stepZoom = useCallback((dir: "in" | "out") => {
    setZoom((prev) => {
      const next = dir === "in" ? zoomInLevel(prev) : zoomOutLevel(prev);
      if (next !== prev) Haptics.selectionAsync();
      return clampZoom(next);
    });
  }, []);

  const pinch = useMemo(
    () =>
      Gesture.Pinch().onEnd((e) => {
        if (!inSelectMode) {
          if (e.scale > 1.2) runOnJS(stepZoom)("in");
          else if (e.scale < 0.85) runOnJS(stepZoom)("out");
        }
      }),
    [stepZoom, inSelectMode],
  );

  // ── select mode ───────────────────────────────────────────────────────────────
  const inSelectModeRef = useRef(inSelectMode);
  inSelectModeRef.current = inSelectMode;

  const enterSelectMode = useCallback((photo?: Photo) => {
    setInSelectMode(true);
    if (photo) {
      setSelectedIds(new Set([photo.id]));
      Haptics.selectionAsync();
    } else {
      setSelectedIds(new Set());
    }
  }, []);

  const cancelSelectMode = useCallback(() => {
    setInSelectMode(false);
    setSelectedIds(new Set());
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

  const selectAll = useCallback(() => {
    Haptics.selectionAsync();
    setSelectedIds(new Set(photos.map((p) => p.id)));
  }, [photos]);

  const onLongPressPhoto = useCallback(
    (photo: Photo) => {
      if (!inSelectModeRef.current) enterSelectMode(photo);
    },
    [enterSelectMode],
  );

  const onPressPhoto = useCallback((p: Photo) => {
    router.push({ pathname: "/photo/[id]", params: { id: p.id } });
  }, []);

  // ── bulk actions ──────────────────────────────────────────────────────────────
  const selectedCount = selectedIds.size;
  const hasSelection = selectedCount > 0;

  const shareSelected = useCallback(async () => {
    if (!hasSelection) return;
    const uris = photos.filter((p) => selectedIds.has(p.id)).map((p) => p.uri);
    if (uris.length === 1) {
      await Share.share({ url: uris[0] });
    } else {
      // React Native Share doesn't support multiple files natively; share first
      await Share.share({ url: uris[0], message: `${uris.length} photos` });
    }
    cancelSelectMode();
  }, [hasSelection, photos, selectedIds, cancelSelectMode]);

  const favoriteSelected = useCallback(() => {
    if (!hasSelection) return;
    const ids = Array.from(selectedIds);
    const allFav = ids.every((id) => favoriteIds.has(id));
    setFavoritesBulk(ids, !allFav);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    cancelSelectMode();
  }, [
    hasSelection,
    selectedIds,
    favoriteIds,
    setFavoritesBulk,
    cancelSelectMode,
  ]);

  const archiveSelected = useCallback(() => {
    if (!hasSelection) return;
    Alert.alert(
      `Archive ${selectedCount} Item${selectedCount === 1 ? "" : "s"}?`,
      "They'll be hidden from your library but accessible in Albums → Archive.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          onPress: () => {
            archivePhotosBulk(Array.from(selectedIds));
            cancelSelectMode();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ],
    );
  }, [
    hasSelection,
    selectedCount,
    selectedIds,
    archivePhotosBulk,
    cancelSelectMode,
  ]);

  const deleteSelected = useCallback(() => {
    if (!hasSelection) return;
    Alert.alert(
      `Delete ${selectedCount} Item${selectedCount === 1 ? "" : "s"}?`,
      "They'll be moved to Recently Deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            moveToRecentlyDeletedBulk(Array.from(selectedIds));
            cancelSelectMode();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ],
    );
  }, [
    hasSelection,
    selectedCount,
    selectedIds,
    moveToRecentlyDeletedBulk,
    cancelSelectMode,
  ]);

  // ── derived all-favorited state for bulk heart icon ───────────────────────────
  const allSelectedFavorited =
    hasSelection && Array.from(selectedIds).every((id) => favoriteIds.has(id));

  useEffect(() => {
    if (permission === "undetermined") requestPermission();
  }, [permission, requestPermission]);

  const headerHeight = insets.top + 60 + (inSelectMode ? 0 : 44 + 18);
  const dockClearance = insets.bottom + 90;
  const selectToolbarBottom = insets.bottom + 80;
  const family = familyForZoom(zoom);

  const toolbarAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: toolbarOffset.value }],
  }));

  if (permission === "denied" || permission === "undetermined") {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <TopGlassBar title="Library" />
        <EmptyState
          icon="lock-closed-outline"
          title="No access to photos"
          body="Memoir builds your gallery from your device's library. Grant photo access to continue."
          actionLabel="Allow Photo Access"
          onAction={() => router.push("/permission")}
        />
      </View>
    );
  }

  if (photos.length === 0) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <TopGlassBar title="Library" />
        <EmptyState
          icon="images-outline"
          title="No photos yet"
          body="When you add photos to this device, they'll appear here."
        />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <GestureDetector gesture={pinch}>
        <View style={styles.fill}>
          <PhotoGrid
            listRef={gridRef}
            photos={photos}
            zoom={zoom}
            onPressPhoto={onPressPhoto}
            onLongPressPhoto={onLongPressPhoto}
            onToggleSelect={toggleSelect}
            onEndReached={loadMore}
            contentTopPadding={headerHeight}
            contentBottomPadding={
              dockClearance + (inSelectMode ? TOOLBAR_HEIGHT + 12 : 0)
            }
            selectedIds={selectedIds}
            favoriteIds={favoriteIds}
            inSelectMode={inSelectMode}
          />
        </View>
      </GestureDetector>

      {/* Top bar — swaps between normal and select mode */}
      <View style={styles.topBlock} pointerEvents="box-none">
        {inSelectMode ? (
          <View
            style={[
              styles.selectBar,
              {
                paddingTop: insets.top + 6,
                backgroundColor: colors.background,
              },
            ]}
          >
            <Pressable
              onPress={cancelSelectMode}
              hitSlop={12}
              style={styles.selectBarSide}
            >
              <Text style={[typography.body, { color: colors.accent }]}>
                Cancel
              </Text>
            </Pressable>
            <Text
              style={[
                typography.headline,
                { color: colors.text, flex: 1, textAlign: "center" },
              ]}
              numberOfLines={1}
            >
              {selectedCount > 0 ? `${selectedCount} Selected` : "Select Items"}
            </Text>
            <Pressable
              onPress={selectAll}
              hitSlop={12}
              style={styles.selectBarSide}
            >
              <Text
                style={[
                  typography.body,
                  { color: colors.accent, textAlign: "right" },
                ]}
              >
                {selectedCount === photos.length ? "None" : "All"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <TopGlassBar
              title="Library"
              subtitle={`${totalCount.toLocaleString()} item${totalCount === 1 ? "" : "s"}`}
              right={
                <Pressable
                  hitSlop={10}
                  onPress={() => enterSelectMode()}
                  style={styles.iconBtn}
                >
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={26}
                    color={colors.accent}
                  />
                </Pressable>
              }
            />
            <View
              style={[
                styles.segmentWrap,
                { backgroundColor: colors.background },
              ]}
            >
              <SegmentedControl
                options={familyOptions}
                value={family}
                onChange={setFamily}
              />
            </View>
          </>
        )}
      </View>

      {/* Bulk action toolbar — slides up from bottom when in select mode */}
      <Animated.View
        style={[
          styles.toolbar,
          { bottom: selectToolbarBottom },
          toolbarAnimStyle,
        ]}
        pointerEvents={inSelectMode ? "box-none" : "none"}
      >
        <GlassView intensity={80} bordered style={styles.toolbarInner}>
          <ToolbarBtn
            icon="share-outline"
            label="Share"
            onPress={shareSelected}
            disabled={!hasSelection}
            color={colors.text}
          />
          <ToolbarBtn
            icon={allSelectedFavorited ? "heart" : "heart-outline"}
            label={allSelectedFavorited ? "Unfavorite" : "Favorite"}
            onPress={favoriteSelected}
            disabled={!hasSelection}
            color={allSelectedFavorited ? "#FF375F" : colors.text}
          />
          <ToolbarBtn
            icon="archive-outline"
            label="Archive"
            onPress={archiveSelected}
            disabled={!hasSelection}
            color={colors.text}
          />
          <ToolbarBtn
            icon="trash-outline"
            label="Delete"
            onPress={deleteSelected}
            disabled={!hasSelection}
            color={hasSelection ? "#FF453A" : colors.textTertiary}
          />
        </GlassView>
      </Animated.View>
    </View>
  );
}

function ToolbarBtn({
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
        styles.toolbarBtn,
        disabled && { opacity: 0.35 },
        pressed && { opacity: 0.55 },
      ]}
    >
      <Ionicons name={icon} size={24} color={color} />
      <Text style={[styles.toolbarLabel, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBlock: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  segmentWrap: {
    paddingVertical: 8,
    alignItems: "center",
  },
  iconBtn: {
    paddingBottom: 2,
  },
  selectBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.2)",
  },
  selectBarSide: {
    width: 70,
  },
  toolbar: {
    position: "absolute",
    left: 16,
    right: 16,
  },
  toolbarInner: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 22,
    borderCurve: "continuous",
  },
  toolbarBtn: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 4,
    minWidth: 60,
  },
  toolbarLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
});
