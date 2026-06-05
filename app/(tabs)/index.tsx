import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sharing from "expo-sharing";
import * as MediaLibrary from "expo-media-library/legacy";
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
  withTiming,
  withSequence,
} from "react-native-reanimated";
import { usePhotos, type Photo } from "../../src/hooks/usePhotos";
import { useTheme } from "../../src/theme/ThemeProvider";
import { PhotoGrid } from "../../src/components/PhotoGrid";
import { GlassView } from "../../src/components/GlassView";
import { TopGlassBar } from "../../src/components/TopGlassBar";
import { EmptyState } from "../../src/components/EmptyState";
import { FastScrollBar } from "../../src/components/FastScrollBar";
import {
  buildGrid,
  computeSectionOffsets,
  DEFAULT_FAMILY,
  FAMILY_COLUMNS,
  zoomInFamily,
  zoomOutFamily,
  type LayoutFamily,
} from "../../src/utils/grouping";
import { addTabScrollToTopListener } from "../../src/hooks/useTabScrollToTop";
import type { FlashListRef } from "@shopify/flash-list";
import type { GridItem } from "../../src/utils/grouping";

const TOOLBAR_HEIGHT = 56;
const FAMILY_KEY = "memoir.layoutFamily.v1";
const SELECT_BAR_SPRING = { damping: 22, stiffness: 280, mass: 0.8 } as const;
const ZOOM_SPRING = { damping: 18, stiffness: 300, mass: 0.7 } as const;

// Pinch scale thresholds — intentionally low for effortless trigger
const PINCH_IN_THRESHOLD = 1.08;
const PINCH_OUT_THRESHOLD = 0.93;

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
    hidePhotosBulk,
    safNeedsPermission,
    requestSafAccess,
    dismissSafPermission,
  } = usePhotos();

  const { width, height } = useWindowDimensions();

  const [family, setFamily] = useState<LayoutFamily>(DEFAULT_FAMILY);

  useEffect(() => {
    AsyncStorage.getItem(FAMILY_KEY)
      .then((saved) => {
        if (
          saved === "days" ||
          saved === "months" ||
          saved === "years" ||
          saved === "all"
        ) {
          setFamily(saved);
        }
      })
      .catch(() => {});
  }, []);

  const [inSelectMode, setInSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sectionTitle, setSectionTitle] = useState<string | null>(null);
  const [sectionSub, setSectionSub] = useState<string | undefined>();

  const gridRef = useRef<FlashListRef<GridItem> | null>(null);
  const toolbarOffset = useSharedValue(TOOLBAR_HEIGHT + 20);
  const toolbarOpacity = useSharedValue(0);
  const scrollFraction = useSharedValue(0);
  const contentHeightRef = useRef(1);

  // Reanimated shared values for pinch animation
  const gridScale = useSharedValue(1);
  const hasTriggered = useSharedValue(false);
  const inSelectModeShared = useSharedValue(false);

  useEffect(() => {
    inSelectModeShared.value = inSelectMode;
  }, [inSelectMode, inSelectModeShared]);

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
      SELECT_BAR_SPRING,
    );
    toolbarOpacity.value = withTiming(inSelectMode ? 1 : 0, { duration: 150 });
  }, [inSelectMode, toolbarOffset, toolbarOpacity]);

  // ── zoom ─────────────────────────────────────────────────────────────────────
  const doZoomIn = useCallback(() => {
    setFamily((f) => {
      const next = zoomInFamily(f);
      if (next !== f) {
        Haptics.selectionAsync();
        gridScale.value = withSequence(
          withTiming(1.06, { duration: 80 }),
          withSpring(1, ZOOM_SPRING),
        );
        AsyncStorage.setItem(FAMILY_KEY, next).catch(() => {});
      }
      return next;
    });
  }, [gridScale]);

  const doZoomOut = useCallback(() => {
    setFamily((f) => {
      const next = zoomOutFamily(f);
      if (next !== f) {
        Haptics.selectionAsync();
        gridScale.value = withSequence(
          withTiming(0.94, { duration: 80 }),
          withSpring(1, ZOOM_SPRING),
        );
        AsyncStorage.setItem(FAMILY_KEY, next).catch(() => {});
      }
      return next;
    });
  }, [gridScale]);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      hasTriggered.value = false;
    })
    .onUpdate((e) => {
      if (inSelectModeShared.value) return;
      // Real-time visual scale — clamped so it never looks broken
      gridScale.value = Math.max(0.82, Math.min(1.22, e.scale));
      if (hasTriggered.value) return;
      if (e.scale > PINCH_IN_THRESHOLD) {
        hasTriggered.value = true;
        runOnJS(doZoomIn)();
      } else if (e.scale < PINCH_OUT_THRESHOLD) {
        hasTriggered.value = true;
        runOnJS(doZoomOut)();
      }
    })
    .onEnd(() => {
      gridScale.value = withSpring(1, ZOOM_SPRING);
    });

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
    const selected = photos.filter((p) => selectedIds.has(p.id));
    const infos = await Promise.all(
      selected.map((p) =>
        p.id.startsWith("saf:")
          ? Promise.resolve({ localUri: p.uri } as { localUri: string })
          : MediaLibrary.getAssetInfoAsync(p.id).catch(() => null),
      ),
    );
    const uri = infos[0]?.localUri ?? selected[0]?.uri;
    if (uri) {
      await Sharing.shareAsync(uri, { dialogTitle: selected[0]?.filename });
    } else {
      Alert.alert("Unable to Share", "Could not resolve a local file path.");
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

  const hideSelected = useCallback(() => {
    if (!hasSelection) return;
    Alert.alert(
      `Hide ${selectedCount} Item${selectedCount === 1 ? "" : "s"}?`,
      "They'll only be visible in Browse → Hidden, protected by biometrics.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Hide",
          onPress: () => {
            hidePhotosBulk(Array.from(selectedIds));
            cancelSelectMode();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ],
    );
  }, [hasSelection, selectedCount, selectedIds, hidePhotosBulk, cancelSelectMode]);

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

  const allSelectedFavorited =
    hasSelection && Array.from(selectedIds).every((id) => favoriteIds.has(id));

  useEffect(() => {
    if (permission === "undetermined") requestPermission();
  }, [permission, requestPermission]);

  const headerHeight = insets.top + 76;
  const dockClearance = insets.bottom + 90;

  // ── section title + scrollbar data ───────────────────────────────────────────
  const handleSectionChange = useCallback(
    (title: string, subtitle?: string) => {
      setSectionTitle(title);
      setSectionSub(subtitle);
    },
    [],
  );

  const handleScrollY = useCallback(
    (y: number) => {
      const maxY = Math.max(1, contentHeightRef.current - height);
      scrollFraction.value = Math.max(0, Math.min(1, y / maxY));
    },
    [height, scrollFraction],
  );

  const handleContentHeight = useCallback((h: number) => {
    contentHeightRef.current = h;
  }, []);

  const columns = FAMILY_COLUMNS[family];
  const tileSize = width / columns;

  const gridItems = useMemo(() => buildGrid(photos, family), [photos, family]);

  const sections = useMemo(
    () => computeSectionOffsets(gridItems, columns, tileSize, headerHeight),
    [gridItems, columns, tileSize, headerHeight],
  );

  const scrollBarContainerH = height - headerHeight - (insets.bottom + 90);
  const displayTitle =
    sectionTitle ??
    (family === "all"
      ? "All Photos"
      : family.charAt(0).toUpperCase() + family.slice(1));
  const displaySub = sectionTitle
    ? sectionSub
    : `${totalCount.toLocaleString()} item${totalCount === 1 ? "" : "s"}`;
  const selectToolbarBottom = insets.bottom + 80;

  const toolbarAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: toolbarOffset.value }],
    opacity: toolbarOpacity.value,
  }));

  const gridAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: gridScale.value }],
  }));

  if (permission === "undetermined") {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]} />
    );
  }

  if (permission === "denied") {
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
        <Animated.View style={[styles.fill, gridAnimStyle]}>
          <PhotoGrid
            listRef={gridRef}
            photos={photos}
            family={family}
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
            onSectionChange={handleSectionChange}
            onScrollY={handleScrollY}
            onContentHeight={handleContentHeight}
          />
        </Animated.View>
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
          <TopGlassBar title={displayTitle} subtitle={displaySub} />
        )}
      </View>

      {/* Bulk action toolbar */}
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
          <ToolbarBtn
            icon="eye-off-outline"
            label="Hide"
            onPress={hideSelected}
            disabled={!hasSelection}
            color={colors.text}
          />
        </GlassView>
      </Animated.View>

      {/* SAF access banner (Android only, shown until granted or dismissed) */}
      {Platform.OS === "android" && safNeedsPermission && !inSelectMode && (
        <View
          style={[
            styles.safBanner,
            { bottom: insets.bottom + 100, backgroundColor: colors.surface },
          ]}
        >
          <Ionicons
            name="folder-open-outline"
            size={20}
            color={colors.accent}
            style={{ marginTop: 1 }}
          />
          <Text
            style={[
              typography.footnote,
              { color: colors.text, flex: 1, lineHeight: 18 },
            ]}
          >
            Some app photos (e.g. WhatsApp) may be hidden.{" "}
            <Text
              style={{ color: colors.accent, fontWeight: "700" }}
              onPress={requestSafAccess}
            >
              Allow folder access
            </Text>
          </Text>
          <Pressable onPress={dismissSafPermission} hitSlop={12}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      )}

      {/* Pullable scrollbar — hidden in select mode */}
      {!inSelectMode && (
        <FastScrollBar
          scrollFraction={scrollFraction}
          containerHeight={scrollBarContainerH}
          contentHeight={contentHeightRef.current}
          sections={sections}
          family={family}
          listRef={gridRef}
          topOffset={headerHeight}
        />
      )}
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 52,
  },
  toolbarLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
  safBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderCurve: "continuous",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
