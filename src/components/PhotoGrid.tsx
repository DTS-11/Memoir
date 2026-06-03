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
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import type { Photo } from "../hooks/usePhotos";
import {
  buildGrid,
  columnsForZoom,
  type GridItem,
  type ZoomLevel,
} from "../utils/grouping";
import { PhotoThumb } from "./PhotoThumb";

type Props = {
  photos: Photo[];
  zoom: ZoomLevel;
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
  zoom,
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
}: Props) {
  const { width } = useWindowDimensions();
  const columns = columnsForZoom(zoom);
  const tileSize = width / columns;

  const items = useMemo<GridItem[]>(
    () => buildGrid(photos, zoom),
    [photos, zoom],
  );

  // Ref-based render state avoids recreating renderItem on every selection change.
  // FlashList's extraData triggers re-renders while renderItem stays stable.
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
  }, []); // stable — reads from rsRef

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
