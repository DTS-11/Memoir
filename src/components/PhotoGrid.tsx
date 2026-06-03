import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import type { Photo } from '../hooks/usePhotos';
import { buildGrid, columnsForZoom, type GridItem, type ZoomLevel } from '../utils/grouping';
import { PhotoThumb } from './PhotoThumb';

type Props = {
  photos: Photo[];
  zoom: ZoomLevel;
  onPressPhoto: (photo: Photo) => void;
  onEndReached?: () => void;
  contentTopPadding?: number;
  contentBottomPadding?: number;
  headerComponent?: React.ReactElement | null;
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
        <Text style={[typography.subhead, { color: colors.textSecondary, marginTop: 2 }]}>
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
  onEndReached,
  contentTopPadding = 0,
  contentBottomPadding = 0,
  headerComponent,
}: Props) {
  const { width } = useWindowDimensions();
  const columns = columnsForZoom(zoom);
  const tileSize = width / columns;

  const items = useMemo<GridItem[]>(() => buildGrid(photos, zoom), [photos, zoom]);

  // `renderItem` only depends on tileSize + onPressPhoto. Theme tokens are read
  // inside SectionHeader / PhotoThumb so the list doesn't re-render on theme.
  const renderItem: ListRenderItem<GridItem> = useCallback(
    ({ item }) => {
      if (item.type === 'header') {
        return <SectionHeader title={item.title} subtitle={item.subtitle} />;
      }
      return <PhotoThumb photo={item.photo} size={tileSize} onPress={onPressPhoto} />;
    },
    [tileSize, onPressPhoto]
  );

  const getItemType = useCallback((it: GridItem) => it.type, []);
  const keyExtractor = useCallback((it: GridItem) => it.id, []);
  const overrideItemLayout = useCallback(
    (layout: { span?: number }, item: GridItem) => {
      if (item.type === 'header') layout.span = columns;
    },
    [columns]
  );

  const contentContainerStyle = useMemo(
    () => ({
      paddingTop: contentTopPadding,
      paddingBottom: contentBottomPadding,
    }),
    [contentTopPadding, contentBottomPadding]
  );

  return (
    <FlashList
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={columns}
      masonry={false}
      // Cap the lookahead so very-zoomed-out grids (large tiles) don't try to
      // pre-render an absurd vertical region.
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
