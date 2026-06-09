import { useCallback, useMemo, useRef, useState } from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePhotos, type Photo } from "../src/hooks/usePhotos";
import { useTheme } from "../src/theme/ThemeProvider";
import { PhotoThumb } from "../src/components/PhotoThumb";
import { EmptyState } from "../src/components/EmptyState";
import type { GridItem } from "../src/utils/grouping";
import { buildGrid } from "../src/utils/grouping";

const COLS = 3;

export default function FavoritesScreen() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { favoritePhotos, favoriteIds, toggleFavorite } = usePhotos();
  const listRef = useRef<FlashListRef<GridItem> | null>(null);
  const [tileWidth, setTileWidth] = useState(0);

  const items = useMemo(() => buildGrid(favoritePhotos, "all"), [favoritePhotos]);

  const onPressPhoto = useCallback((p: Photo) => {
    router.push({ pathname: "/photo/[id]", params: { id: p.id } });
  }, []);

  const overrideItemLayout = useCallback((layout: { span?: number }, item: GridItem) => {
    if (item.type === "header") layout.span = COLS;
  }, []);

  const contentContainerStyle = useMemo(
    () => ({ paddingBottom: insets.bottom + 20 }),
    [insets.bottom],
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setTileWidth(e.nativeEvent.layout.width / COLS);
  }, []);

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
      return (
        <PhotoThumb
          photo={item.photo}
          size={tileWidth || 120}
          onPress={onPressPhoto}
          isFavorite={favoriteIds.has(item.photo.id)}
        />
      );
    },
    [tileWidth, onPressPhoto, favoriteIds, colors, typography],
  );

  return (
    <View
      style={[styles.fill, { backgroundColor: colors.background }]}
      onLayout={onLayout}
    >
      {/* Header */}
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
          <Text style={[typography.headline, { color: colors.text }]}>Favorites</Text>
          {favoritePhotos.length > 0 && (
            <Text
              style={[typography.footnote, { color: colors.textSecondary, marginTop: 1 }]}
            >
              {favoritePhotos.length} item
              {favoritePhotos.length === 1 ? "" : "s"}
            </Text>
          )}
        </View>
        <View style={styles.headerSide} />
      </View>

      {favoritePhotos.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          title="No Favorites Yet"
          body="Tap the heart icon when viewing a photo to add it to Favorites."
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
    </View>
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
});
