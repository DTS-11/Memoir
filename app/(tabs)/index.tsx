import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import * as FileSystem from "expo-file-system/legacy";
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
  gridIndexForPhoto,
  photoIndexFromTouch,
  DEFAULT_FAMILY,
  FAMILY_COLUMNS,
  zoomInFamily,
  zoomOutFamily,
  type LayoutFamily,
} from "../../src/utils/grouping";
import { addTabScrollToTopListener } from "../../src/hooks/useTabScrollToTop";
import { photoToParams } from "../../src/utils/photoParams";
import type { FlashListRef } from "@shopify/flash-list";
import type { GridItem } from "../../src/utils/grouping";

const TOOLBAR_HEIGHT = 56;
const FAMILY_KEY = "memoir.layoutFamily.v1";
const MEDIA_FILTER_KEY = "memoir.mediaFilter.v1";
const SELECT_BAR_SPRING = { damping: 22, stiffness: 280, mass: 0.8 } as const;
const ZOOM_SPRING = { damping: 18, stiffness: 300, mass: 0.7 } as const;
const CHIPS_H = 52;

const PINCH_IN_THRESHOLD = 1.08; // intentionally low for effortless trigger
const PINCH_OUT_THRESHOLD = 0.93;

type MediaFilter = "all" | "photo" | "video";

const MEDIA_FILTERS: { key: MediaFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "photo", label: "Photos" },
  { key: "video", label: "Videos" },
];

export default function Library() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    permission,
    photos,
    loading,
    requestPermission,
    loadMore,
    favoriteIds,
    setFavoritesBulk,
    moveToRecentlyDeletedBulk,
    archivePhotosBulk,
    hidePhotosBulk,
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

  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");

  useEffect(() => {
    AsyncStorage.getItem(MEDIA_FILTER_KEY)
      .then((saved) => {
        if (saved === "all" || saved === "photo" || saved === "video") {
          setMediaFilter(saved);
        }
      })
      .catch(() => {});
  }, []);

  const filteredPhotos = useMemo(
    () =>
      mediaFilter === "all" ? photos : photos.filter((p) => p.mediaType === mediaFilter),
    [photos, mediaFilter],
  );

  const [inSelectMode, setInSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sectionTitle, setSectionTitle] = useState<string | null>(null);
  const [sectionSub, setSectionSub] = useState<string | undefined>();

  // Refs kept in sync for use inside gesture worklet callbacks
  const scrollYRef = useRef(0);
  const dragAnchorIndexRef = useRef(-1);
  const lastDragIndexRef = useRef(-1);

  const gridRef = useRef<FlashListRef<GridItem> | null>(null);
  const toolbarOffset = useSharedValue(TOOLBAR_HEIGHT + 20);
  const toolbarOpacity = useSharedValue(0);
  const scrollFraction = useSharedValue(0);
  const contentHeightRef = useRef(1);

  const gridScale = useSharedValue(1);
  const gridOpacity = useSharedValue(1);
  const hasTriggered = useSharedValue(false);
  const inSelectModeShared = useSharedValue(false);
  const zoomAnchorRef = useRef<string | null>(null);

  useEffect(() => {
    inSelectModeShared.value = inSelectMode;
  }, [inSelectMode, inSelectModeShared]);

  useEffect(() => {
    return addTabScrollToTopListener("index", () => {
      gridRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
  }, []);

  useEffect(() => {
    toolbarOffset.value = withSpring(
      inSelectMode ? 0 : TOOLBAR_HEIGHT + 20,
      SELECT_BAR_SPRING,
    );
    toolbarOpacity.value = withTiming(inSelectMode ? 1 : 0, { duration: 150 });
  }, [inSelectMode, toolbarOffset, toolbarOpacity]);

  const captureZoomAnchor = useCallback((focalX: number, focalY: number) => {
    const ps = photosRef.current;
    if (ps.length === 0) return;
    const idx = photoIndexFromTouch(
      focalX,
      focalY,
      scrollYRef.current,
      gridItemsRef.current,
      tileSizeRef.current,
      columnsRef.current,
      headerHeightRef.current,
    );
    const photo = ps[Math.max(0, Math.min(idx, ps.length - 1))];
    if (photo) zoomAnchorRef.current = photo.id;
  }, []);

  const doZoomIn = useCallback(
    (focalX = width / 2, focalY = height / 2) => {
      setFamily((f) => {
        const next = zoomInFamily(f);
        if (next !== f) {
          Haptics.selectionAsync();
          captureZoomAnchor(focalX, focalY);
          gridScale.value = withSequence(
            withTiming(1.06, { duration: 80 }),
            withSpring(1, ZOOM_SPRING),
          );
          gridOpacity.value = withTiming(0.45, { duration: 70 });
          AsyncStorage.setItem(FAMILY_KEY, next).catch(() => {});
        }
        return next;
      });
    },
    [captureZoomAnchor, gridScale, gridOpacity, height, width],
  );

  const doZoomOut = useCallback(
    (focalX = width / 2, focalY = height / 2) => {
      setFamily((f) => {
        const next = zoomOutFamily(f);
        if (next !== f) {
          Haptics.selectionAsync();
          captureZoomAnchor(focalX, focalY);
          gridScale.value = withSequence(
            withTiming(0.94, { duration: 80 }),
            withSpring(1, ZOOM_SPRING),
          );
          gridOpacity.value = withTiming(0.45, { duration: 70 });
          AsyncStorage.setItem(FAMILY_KEY, next).catch(() => {});
        }
        return next;
      });
    },
    [captureZoomAnchor, gridScale, gridOpacity, height, width],
  );

  const pinch = Gesture.Pinch()
    .onStart(() => {
      hasTriggered.value = false;
    })
    .onUpdate((e) => {
      if (inSelectModeShared.value) return;
      gridScale.value = Math.max(0.82, Math.min(1.22, e.scale));
      if (hasTriggered.value) return;
      if (e.scale > PINCH_IN_THRESHOLD) {
        hasTriggered.value = true;
        runOnJS(doZoomIn)(e.focalX, e.focalY);
      } else if (e.scale < PINCH_OUT_THRESHOLD) {
        hasTriggered.value = true;
        runOnJS(doZoomOut)(e.focalX, e.focalY);
      }
    })
    .onEnd(() => {
      gridScale.value = withSpring(1, ZOOM_SPRING);
    });

  // After the grid rebuilds with a new layout, restore the scroll position so
  // the section under the pinch stays on screen — like Apple Photos.
  useEffect(() => {
    const anchor = zoomAnchorRef.current;
    if (anchor == null) return;
    zoomAnchorRef.current = null;
    const items = gridItemsRef.current;
    const idx = gridIndexForPhoto(items, anchor);
    if (idx < 0) return;
    requestAnimationFrame(() => {
      try {
        gridRef.current?.scrollToIndex({
          index: idx,
          viewPosition: 0.5,
          animated: false,
        });
      } catch {}
    });
    gridOpacity.value = withTiming(1, { duration: 140 });
  }, [family, gridOpacity]);

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
    setSelectedIds(new Set(filteredPhotos.map((p) => p.id)));
  }, [filteredPhotos]);

  const onLongPressPhoto = useCallback(
    (photo: Photo) => {
      if (!inSelectModeRef.current) enterSelectMode(photo);
    },
    [enterSelectMode],
  );

  // Stable refs for use inside gesture callbacks (avoid stale closures)
  const photosRef = useRef(filteredPhotos);
  photosRef.current = filteredPhotos;
  const gridItemsRef = useRef<typeof gridItems>([] as typeof gridItems);
  const columnsRef = useRef(0);
  const tileSizeRef = useRef(0);
  const headerHeightRef = useRef(0);

  const handleDragStart = useCallback((absX: number, absY: number) => {
    const idx = photoIndexFromTouch(
      absX,
      absY,
      scrollYRef.current,
      gridItemsRef.current,
      tileSizeRef.current,
      columnsRef.current,
      headerHeightRef.current,
    );
    const photo = photosRef.current[idx];
    if (!photo) return;
    dragAnchorIndexRef.current = idx;
    lastDragIndexRef.current = idx;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(photo.id);
      return next;
    });
  }, []);

  const handleDragMove = useCallback((absX: number, absY: number) => {
    const anchor = dragAnchorIndexRef.current;
    if (anchor < 0) return;
    const idx = photoIndexFromTouch(
      absX,
      absY,
      scrollYRef.current,
      gridItemsRef.current,
      tileSizeRef.current,
      columnsRef.current,
      headerHeightRef.current,
    );
    if (idx === lastDragIndexRef.current) return;
    lastDragIndexRef.current = idx;
    Haptics.selectionAsync();
    const ps = photosRef.current;
    const lo = Math.min(anchor, idx);
    const hi = Math.max(anchor, idx);
    const next = new Set<string>();
    for (let i = lo; i <= hi && i < ps.length; i++) next.add(ps[i].id);
    setSelectedIds(next);
  }, []);

  const handleDragEnd = useCallback(() => {
    dragAnchorIndexRef.current = -1;
    lastDragIndexRef.current = -1;
  }, []);

  const dragSelect = useMemo(
    () =>
      Gesture.Pan()
        .enabled(inSelectMode)
        .minDistance(0)
        .onStart((e) => {
          runOnJS(handleDragStart)(e.absoluteX, e.absoluteY);
        })
        .onUpdate((e) => {
          runOnJS(handleDragMove)(e.absoluteX, e.absoluteY);
        })
        .onEnd(() => {
          runOnJS(handleDragEnd)();
        }),
    [inSelectMode, handleDragStart, handleDragMove, handleDragEnd],
  );

  const composed = useMemo(
    () => Gesture.Simultaneous(pinch, dragSelect),
    [pinch, dragSelect],
  );

  const onPressPhoto = useCallback((p: Photo) => {
    router.push({
      pathname: "/photo/[id]",
      params: { ...photoToParams(p) },
    });
  }, []);

  const selectedCount = selectedIds.size;
  const hasSelection = selectedCount > 0;

  const shareSelected = useCallback(async () => {
    if (!hasSelection) return;
    const selected = photos.filter((p) => selectedIds.has(p.id));
    const item = selected[0];
    if (!item) {
      cancelSelectMode();
      return;
    }

    let srcUri: string | null = null;
    const info = await MediaLibrary.getAssetInfoAsync(item.id).catch(() => null);
    srcUri = info?.localUri ?? item.uri ?? null;

    if (!srcUri) {
      Alert.alert("Unable to Share", "Could not resolve local file path for this item.");
      cancelSelectMode();
      return;
    }

    try {
      let shareUri = srcUri;
      // Android expo-sharing requires a file:// URI; content:// must be copied to cache first
      if (Platform.OS === "android" && srcUri.startsWith("content://")) {
        const ext = item.filename.split(".").pop() ?? "mp4";
        const dest = `${FileSystem.cacheDirectory}share_${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: srcUri, to: dest });
        shareUri = dest;
      }
      await Sharing.shareAsync(shareUri, { dialogTitle: item.filename });
    } catch {
      Alert.alert("Unable to Share", "Could not share this item.");
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
  }, [hasSelection, selectedIds, favoriteIds, setFavoritesBulk, cancelSelectMode]);

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
  }, [hasSelection, selectedCount, selectedIds, archivePhotosBulk, cancelSelectMode]);

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
            moveToRecentlyDeletedBulk(photos.filter((p) => selectedIds.has(p.id)));
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
    photos,
    moveToRecentlyDeletedBulk,
    cancelSelectMode,
  ]);

  const hideSelected = useCallback(() => {
    if (!hasSelection) return;
    Alert.alert(
      `Hide ${selectedCount} Item${selectedCount === 1 ? "" : "s"}?`,
      "They'll be removed from your library and only visible in Albums → Hidden, protected by your device lock.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Hide",
          style: "destructive",
          onPress: () => {
            hidePhotosBulk(Array.from(selectedIds));
            cancelSelectMode();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ],
    );
  }, [hasSelection, selectedCount, selectedIds, hidePhotosBulk, cancelSelectMode]);

  const allSelectedFavorited =
    hasSelection && Array.from(selectedIds).every((id) => favoriteIds.has(id));

  useEffect(() => {
    if (permission === "undetermined") requestPermission();
  }, [permission, requestPermission]);

  const headerHeight = insets.top + 76 + CHIPS_H;
  const dockClearance = insets.bottom + 90;

  const handleSectionChange = useCallback((title: string, subtitle?: string) => {
    setSectionTitle(title);
    setSectionSub(subtitle);
  }, []);

  const handleScrollY = useCallback(
    (y: number) => {
      scrollYRef.current = y;
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

  const gridItems = useMemo(
    () => buildGrid(filteredPhotos, family),
    [filteredPhotos, family],
  );

  // Keep refs in sync so drag gesture callbacks always see fresh values
  gridItemsRef.current = gridItems;
  columnsRef.current = columns;
  tileSizeRef.current = tileSize;
  headerHeightRef.current = headerHeight;

  const sections = useMemo(
    () => computeSectionOffsets(gridItems, columns, tileSize, headerHeight),
    [gridItems, columns, tileSize, headerHeight],
  );

  const scrollBarContainerH = height - headerHeight - (insets.bottom + 90);
  const displayTitle =
    sectionTitle ??
    (family === "all" ? "All Photos" : family.charAt(0).toUpperCase() + family.slice(1));
  const displaySub = sectionTitle
    ? sectionSub
    : `${filteredPhotos.length.toLocaleString()} item${filteredPhotos.length === 1 ? "" : "s"}`;
  const selectToolbarBottom = insets.bottom + 80;

  const toolbarAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: toolbarOffset.value }],
    opacity: toolbarOpacity.value,
  }));

  const gridAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: gridScale.value }],
    opacity: gridOpacity.value,
  }));

  if (permission === "undetermined") {
    return <View style={[styles.fill, { backgroundColor: colors.background }]} />;
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

  if (loading && photos.length === 0) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <TopGlassBar title="Library" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text
            style={[typography.callout, { color: colors.textSecondary, marginTop: 14 }]}
          >
            Gathering your library…
          </Text>
        </View>
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
          body="When you add photos to this device, they'll appear here. Tap any empty space to refresh."
        />
      </View>
    );
  }

  if (filteredPhotos.length === 0) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <TopGlassBar title="Library" />
        <EmptyState
          icon={mediaFilter === "video" ? "videocam-outline" : "image-outline"}
          title={`No ${mediaFilter}s found`}
          body="Try a different filter or add more media to this device."
          actionLabel="Show All"
          onAction={() => {
            setMediaFilter("all");
            AsyncStorage.setItem(MEDIA_FILTER_KEY, "all").catch(() => {});
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.fill, gridAnimStyle]}>
          <PhotoGrid
            listRef={gridRef}
            photos={filteredPhotos}
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
            scrollEnabled={!inSelectMode}
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
              <Text style={[typography.body, { color: colors.accent }]}>Cancel</Text>
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
            <Pressable onPress={selectAll} hitSlop={12} style={styles.selectBarSide}>
              <Text
                style={[typography.body, { color: colors.accent, textAlign: "right" }]}
              >
                {selectedCount === filteredPhotos.length ? "None" : "All"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <TopGlassBar title={displayTitle} subtitle={displaySub} />
            <View style={[styles.chipsRow, { backgroundColor: colors.background }]}>
              {MEDIA_FILTERS.map((f) => {
                const active = mediaFilter === f.key;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setMediaFilter(f.key);
                      AsyncStorage.setItem(MEDIA_FILTER_KEY, f.key).catch(() => {});
                    }}
                    style={[
                      styles.chip,
                      { backgroundColor: active ? colors.accent : colors.accentMuted },
                    ]}
                  >
                    <Text
                      style={[
                        typography.subhead,
                        {
                          color: active ? colors.background : colors.textSecondary,
                        },
                      ]}
                    >
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </View>

      {/* Bulk action toolbar */}
      <Animated.View
        style={[styles.toolbar, { bottom: selectToolbarBottom }, toolbarAnimStyle]}
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
            icon="eye-off-outline"
            label="Hide"
            onPress={hideSelected}
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
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  chip: {
    paddingHorizontal: 16,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 80,
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 56,
  },
  toolbarLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
});
