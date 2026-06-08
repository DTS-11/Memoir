import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as MediaLibrary from "expo-media-library/legacy";
import { useTheme } from "../../src/theme/ThemeProvider";
import { PhotoGrid } from "../../src/components/PhotoGrid";
import { TopGlassBar } from "../../src/components/TopGlassBar";
import { EmptyState } from "../../src/components/EmptyState";
import type { Photo } from "../../src/hooks/usePhotos";

const PAGE_SIZE = 200;

export default function AlbumScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const loadMore = useCallback(async () => {
    if (!id || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await MediaLibrary.getAssetsAsync({
        album: id,
        first: PAGE_SIZE,
        after: endCursor,
        mediaType: ["photo", "video"],
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      const mapped: Photo[] = res.assets.map((a) => ({
        id: a.id,
        uri: a.uri,
        width: a.width,
        height: a.height,
        creationTime: a.creationTime,
        duration: a.duration,
        mediaType: a.mediaType,
        filename: a.filename,
      }));
      setPhotos((prev) => (endCursor ? [...prev, ...mapped] : mapped));
      setEndCursor(res.endCursor);
      setHasMore(res.hasNextPage);
    } catch {
      // keep whatever we already have
    } finally {
      setLoadingMore(false);
      setInitialLoaded(true);
    }
  }, [id, endCursor, hasMore, loadingMore]);

  useEffect(() => {
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onPressPhoto = useCallback((p: Photo) => {
    router.push({ pathname: "/photo/[id]", params: { id: p.id } });
  }, []);

  const headerHeight = insets.top + 64;
  const bottomPadding = insets.bottom + 90;

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      {photos.length > 0 ? (
        <PhotoGrid
          photos={photos}
          family="days"
          onPressPhoto={onPressPhoto}
          onEndReached={loadMore}
          contentTopPadding={headerHeight}
          contentBottomPadding={bottomPadding}
        />
      ) : (
        <View style={[styles.fill, { paddingTop: headerHeight }]}>
          <EmptyState
            icon="images-outline"
            title={initialLoaded ? "No photos in this album" : "Loading album…"}
          />
        </View>
      )}

      <View pointerEvents="box-none" style={styles.topBlock}>
        <TopGlassBar
          title={title || "Album"}
          subtitle={`${photos.length}${hasMore ? "+" : ""} items`}
          right={
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Ionicons
                name="chevron-back-circle"
                size={28}
                color={colors.accent}
              />
            </Pressable>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBlock: { position: "absolute", top: 0, left: 0, right: 0 },
});
