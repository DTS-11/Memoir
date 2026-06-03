import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { useCallback, useMemo } from 'react';
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
  const { colors, typography } = useTheme();

  const columns = columnsForZoom(zoom);
  const tileSize = width / columns;

  const items = useMemo<GridItem[]>(() => buildGrid(photos, zoom), [photos, zoom]);

  const renderItem: ListRenderItem<GridItem> = useCallback(
    ({ item }) => {
      if (item.type === 'header') {
        return (
          <View style={styles.header}>
            <Text style={[typography.title3, { color: colors.text }]}>{item.title}</Text>
            {!!item.subtitle && (
              <Text style={[typography.subhead, { color: colors.textSecondary, marginTop: 2 }]}>
                {item.subtitle}
              </Text>
            )}
          </View>
        );
      }
      return <PhotoThumb photo={item.photo} size={tileSize} onPress={onPressPhoto} />;
    },
    [colors, onPressPhoto, tileSize, typography]
  );

  return (
    <FlashList
      data={items}
      renderItem={renderItem}
      keyExtractor={(it) => it.id}
      numColumns={columns}
      masonry={false}
      drawDistance={tileSize * 8}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      ListHeaderComponent={headerComponent}
      contentContainerStyle={{
        paddingTop: contentTopPadding,
        paddingBottom: contentBottomPadding,
      }}
      getItemType={(it) => it.type}
      overrideItemLayout={(layout, item) => {
        if (item.type === 'header') {
          layout.span = columns;
        }
      }}
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
