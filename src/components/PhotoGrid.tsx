import {
  FlashList,
  type ListRenderItem,
  type FlashListRef,
} from "@shopify/flash-list";
import {
  memo,
  useCallback,
  useMemo,
  useRef,
  type MutableRefObject,
} from "react";
import {
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import type { Photo } from "../hooks/usePhotos";
import {
  buildGrid,
  FAMILY_COLUMNS,
  type GridItem,
  type LayoutFamily,
} from "../utils/grouping";
import { PhotoThumb } from "./PhotoThumb";

type Props = {
  photos: Photo[];
  family: LayoutFamily;
  onPressPhoto: (photo: Photo) => void;
  onLongPressPhoto?: (photo: Photo) => void;
  onToggleSelect?: (photo: Photo) => void;
  onEndReached?: () => void;
  contentTopPadding?: number;
  contentBottomPadding?: number;
  headerComponent?: React.ReactElement | null;
  listRef?: MutableRefObject<FlashListRef<GridItem> | null>;
  selectedIds?: Set<string>;
  favoriteIds?: Set<string>;
  inSelectMode?: boolean;
  /** Called when the topmost visible section changes while scrolling. */
  onSectionChange?: (title: string, subtitle?: string) => void;
  /** Called with the current scroll Y offset (throttled to ~60 fps). */
  onScrollY?: (y: number) => void;
  /** Called once after layout with the full content height. */
  onContentHeight?: (h: number) => void;
};

const SectionHeader = memo(function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.header}>
      <Text style={[typography.title3, { color: colors.text }]}>{title}</Text>
      {!!subtitle && (
        <Text
          style={[
            typography.subhead,
            { color: colors.textSecondary, marginTop: 2 },
          ]}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
});

export function PhotoGrid({
  photos,
  family,
  onPressPhoto,
  onLongPressPhoto,
  onToggleSelect,
  onEndReached,
  contentTopPadding = 0,
  contentBottomPadding = 0,
  headerComponent,
  listRef,
  selectedIds,
  favoriteIds,
  inSelectMode = false,
  onSectionChange,
  onScrollY,
  onContentHeight,
}: Props) {
  const { width } = useWindowDimensions();
  const columns = FAMILY_COLUMNS[family];
  const tileSize = width / columns;

  const items = useMemo<GridItem[]>(
    () => buildGrid(photos, family),
    [photos, family],
  );

  // Map each item id → its section header for O(1) lookup during scroll
  const sectionMap = useMemo(() => {
    const map = new Map<string, { title: string; subtitle?: string }>();
    let cur: { title: string; subtitle?: string } | null = null;
    for (const item of items) {
      if (item.type === "header") {
        cur = { title: item.title, subtitle: item.subtitle };
        map.set(item.id, cur);
      } else if (cur) {
        map.set(item.id, cur);
      }
    }
    return map;
  }, [items]);

  const lastSectionKey = useRef<string | null>(null);

  const viewabilityConfig = useMemo(
    () => ({ minimumViewTime: 0, itemVisiblePercentThreshold: 10 }),
    [],
  );

  const onViewableItemsChanged = useCallback(
    ({
      viewableItems,
    }: {
      viewableItems: Array<{ item: GridItem; isViewable: boolean }>;
    }) => {
      if (!onSectionChange || viewableItems.length === 0) return;
      const first = viewableItems[0].item;

      let title: string | undefined;
      let subtitle: string | undefined;
      let key: string;

      if (first.type === "header") {
        title = first.title;
        subtitle = first.subtitle;
        key = first.id;
      } else if (family === "all") {
        // Derive month+year from the first visible photo
        const d = new Date((first as { photo: Photo }).photo.creationTime);
        title = d.toLocaleString(undefined, { month: "long", year: "numeric" });
        key = title;
      } else {
        const entry = sectionMap.get(first.id);
        if (!entry) return;
        title = entry.title;
        subtitle = entry.subtitle;
        key = first.id;
      }

      if (key !== lastSectionKey.current) {
        lastSectionKey.current = key;
        onSectionChange(title!, subtitle);
      }
    },
    [family, sectionMap, onSectionChange],
  );

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      onScrollY?.(e.nativeEvent.contentOffset.y);
    },
    [onScrollY],
  );

  const handleContentSizeChange = useCallback(
    (_: number, h: number) => {
      onContentHeight?.(h);
    },
    [onContentHeight],
  );

  const rsRef = useRef({
    tileSize,
    onPressPhoto,
    onLongPressPhoto,
    onToggleSelect,
    selectedIds,
    favoriteIds,
    inSelectMode,
  });
  rsRef.current = {
    tileSize,
    onPressPhoto,
    onLongPressPhoto,
    onToggleSelect,
    selectedIds,
    favoriteIds,
    inSelectMode,
  };

  const renderItem = useCallback<ListRenderItem<GridItem>>(({ item }) => {
    const rs = rsRef.current;
    if (item.type === "header") {
      return <SectionHeader title={item.title} subtitle={item.subtitle} />;
    }
    const photo = item.photo;
    return (
      <PhotoThumb
        photo={photo}
        size={rs.tileSize}
        onPress={rs.inSelectMode ? rs.onToggleSelect : rs.onPressPhoto}
        onLongPress={rs.onLongPressPhoto}
        selected={rs.selectedIds?.has(photo.id) ?? false}
        inSelectMode={rs.inSelectMode}
        isFavorite={rs.favoriteIds?.has(photo.id) ?? false}
      />
    );
  }, []);

  const extraData = useMemo(
    () => ({ selectedIds, favoriteIds, inSelectMode, tileSize }),
    [selectedIds, favoriteIds, inSelectMode, tileSize],
  );

  const getItemType = useCallback((it: GridItem) => it.type, []);
  const keyExtractor = useCallback((it: GridItem) => it.id, []);
  const overrideItemLayout = useCallback(
    (layout: { span?: number }, item: GridItem) => {
      if (item.type === "header") layout.span = columns;
    },
    [columns],
  );

  const contentContainerStyle = useMemo(
    () => ({
      paddingTop: contentTopPadding,
      paddingBottom: contentBottomPadding,
    }),
    [contentTopPadding, contentBottomPadding],
  );

  return (
    <FlashList
      ref={listRef}
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      extraData={extraData}
      numColumns={columns}
      masonry={false}
      drawDistance={Math.min(tileSize * 4, 1200)}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={headerComponent}
      contentContainerStyle={contentContainerStyle}
      getItemType={getItemType}
      overrideItemLayout={overrideItemLayout}
      viewabilityConfig={viewabilityConfig}
      onViewableItemsChanged={onViewableItemsChanged}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      onContentSizeChange={handleContentSizeChange}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
  },
});
