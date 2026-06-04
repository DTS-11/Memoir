import { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../src/theme/ThemeProvider";
import { PhotoGrid } from "../../src/components/PhotoGrid";
import { TopGlassBar } from "../../src/components/TopGlassBar";
import { EmptyState } from "../../src/components/EmptyState";
import { usePhotos, type Photo } from "../../src/hooks/usePhotos";
import { getCategory } from "../../src/utils/categories";

export default function CategoryScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { photos, loadMore, hasMore } = usePhotos();

  const category = useMemo(() => (key ? getCategory(key) : undefined), [key]);
  const filtered = useMemo(
    () => (category ? photos.filter(category.match) : []),
    [photos, category],
  );

  const onPressPhoto = useCallback((p: Photo) => {
    router.push({ pathname: "/photo/[id]", params: { id: p.id } });
  }, []);

  const headerHeight = insets.top + 64;
  const bottomPadding = insets.bottom + 90;

  if (!category) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <TopGlassBar title="Category" />
        <EmptyState icon="alert-circle-outline" title="Unknown category" />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      {filtered.length > 0 ? (
        <PhotoGrid
          photos={filtered}
          family="days"
          onPressPhoto={onPressPhoto}
          onEndReached={hasMore ? loadMore : undefined}
          contentTopPadding={headerHeight}
          contentBottomPadding={bottomPadding}
        />
      ) : (
        <View style={[styles.fill, { paddingTop: headerHeight }]}>
          <EmptyState
            icon={category.icon}
            title={`No ${category.label}`}
            body="Nothing in your library matches this category yet."
          />
        </View>
      )}

      <View pointerEvents="box-none" style={styles.topBlock}>
        <TopGlassBar
          title={category.label}
          subtitle={`${filtered.length.toLocaleString()} item${filtered.length === 1 ? "" : "s"}`}
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
