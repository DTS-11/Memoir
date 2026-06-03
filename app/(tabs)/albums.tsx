import { useCallback, useEffect, useRef } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../src/theme/ThemeProvider";
import { addTabScrollToTopListener } from "../../src/hooks/useTabScrollToTop";
import { TopGlassBar } from "../../src/components/TopGlassBar";
import { EmptyState } from "../../src/components/EmptyState";
import { useAlbums, type AlbumPreview } from "../../src/hooks/useAlbums";
import { usePhotos } from "../../src/hooks/usePhotos";

export default function AlbumsScreen() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { permission, favoritePhotos, archivedPhotos, deletedItems } =
    usePhotos();
  const enabled = permission === "granted" || permission === "limited";
  const { albums, smart, loading } = useAlbums(enabled);
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);

  const cardW = (width - 16 * 2 - 12) / 2;

  useEffect(() => {
    return addTabScrollToTopListener("albums", () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  }, []);

  const openAlbum = useCallback((a: AlbumPreview) => {
    if (a.type === "smart") {
      // Smart albums map onto category drill-downs.
      router.push({
        pathname: "/category/[key]",
        params: { key: a.id.replace(/^smart:/i, "").toLowerCase() },
      });
    } else {
      router.push({
        pathname: "/album/[id]",
        params: { id: a.id, title: a.title },
      });
    }
  }, []);

  if (!enabled) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <TopGlassBar title="Albums" />
        <EmptyState
          icon="albums-outline"
          title="Albums will appear here"
          body="Grant photo access to view your albums."
          actionLabel="Allow Photo Access"
          onAction={() => router.push("/permission")}
        />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scrollRef}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingTop: insets.top + 80,
          paddingBottom: insets.bottom + 110,
          paddingHorizontal: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={[typography.title2, { color: colors.text, marginBottom: 12 }]}
        >
          My Albums
        </Text>
        <View style={styles.grid}>
          {albums.map((a) => (
            <AlbumCard key={a.id} album={a} width={cardW} onPress={openAlbum} />
          ))}
          {albums.length === 0 && !loading && (
            <Text
              style={[
                typography.subhead,
                { color: colors.textSecondary, marginVertical: 16 },
              ]}
            >
              No user albums yet.
            </Text>
          )}
        </View>

        <Text
          style={[
            typography.title2,
            { color: colors.text, marginTop: 24, marginBottom: 12 },
          ]}
        >
          Media Types
        </Text>
        <View
          style={[styles.list, { backgroundColor: colors.surfaceElevated }]}
        >
          {smart.map((s, i) => (
            <SmartRow
              key={s.id}
              album={s}
              divider={i < smart.length - 1}
              onPress={openAlbum}
            />
          ))}
        </View>

        <Text
          style={[
            typography.title2,
            { color: colors.text, marginTop: 24, marginBottom: 12 },
          ]}
        >
          Utilities
        </Text>
        <View
          style={[styles.list, { backgroundColor: colors.surfaceElevated }]}
        >
          <UtilityRow
            icon="heart"
            iconColor="#FF375F"
            iconBg="#FF375F22"
            label="Favorites"
            count={favoritePhotos.length}
            coverUri={favoritePhotos[0]?.uri}
            divider
            onPress={() => router.push("/favorites")}
          />
          <UtilityRow
            icon="archive"
            iconColor="#FF9500"
            iconBg="#FF950022"
            label="Archive"
            count={archivedPhotos.length}
            coverUri={archivedPhotos[0]?.uri}
            divider
            onPress={() => router.push("/archive")}
          />
          <UtilityRow
            icon="trash"
            iconColor="#FF453A"
            iconBg="#FF453A22"
            label="Recently Deleted"
            count={deletedItems.length}
            onPress={() => router.push("/recently-deleted")}
          />
        </View>
      </ScrollView>
      <TopGlassBar title="Albums" />
    </View>
  );
}

function UtilityRow({
  icon,
  iconColor,
  iconBg,
  label,
  count,
  coverUri,
  divider,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  label: string;
  count: number;
  coverUri?: string;
  divider?: boolean;
  onPress: () => void;
}) {
  const { colors, typography } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        divider && {
          borderBottomColor: colors.separator,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
        pressed && { backgroundColor: colors.surface },
      ]}
    >
      <View
        style={[
          styles.rowThumb,
          { backgroundColor: iconBg, overflow: "hidden" },
        ]}
      >
        {coverUri ? (
          <Image
            source={{ uri: coverUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name={icon} size={22} color={iconColor} />
          </View>
        )}
      </View>
      <Text style={[typography.body, { color: colors.text, flex: 1 }]}>
        {label}
      </Text>
      {count > 0 && (
        <Text style={[typography.subhead, { color: colors.textSecondary }]}>
          {count}
        </Text>
      )}
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

function AlbumCard({
  album,
  width,
  onPress,
}: {
  album: AlbumPreview;
  width: number;
  onPress: (a: AlbumPreview) => void;
}) {
  const { colors, typography } = useTheme();
  return (
    <Pressable
      onPress={() => onPress(album)}
      style={({ pressed }) => [
        { width, marginBottom: 18, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View
        style={[
          styles.cover,
          { width, height: width, backgroundColor: colors.thumbPlaceholder },
        ]}
      >
        {album.coverUri ? (
          <Image
            source={{ uri: album.coverUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View
            style={[styles.coverFallback, { backgroundColor: colors.surface }]}
          >
            <Ionicons name="images" size={28} color={colors.textTertiary} />
          </View>
        )}
      </View>
      <Text
        numberOfLines={1}
        style={[typography.subhead, { color: colors.text, marginTop: 8 }]}
      >
        {album.title}
      </Text>
      <Text style={[typography.footnote, { color: colors.textSecondary }]}>
        {album.count.toLocaleString()}
      </Text>
    </Pressable>
  );
}

function SmartRow({
  album,
  divider,
  onPress,
}: {
  album: AlbumPreview;
  divider: boolean;
  onPress: (a: AlbumPreview) => void;
}) {
  const { colors, typography } = useTheme();
  return (
    <Pressable
      onPress={() => onPress(album)}
      style={({ pressed }) => [
        styles.row,
        divider && {
          borderBottomColor: colors.separator,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
        pressed && { backgroundColor: colors.surface },
      ]}
    >
      <View
        style={[styles.rowThumb, { backgroundColor: colors.thumbPlaceholder }]}
      >
        {album.coverUri ? (
          <Image
            source={{ uri: album.coverUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : null}
      </View>
      <Text
        style={[typography.body, { color: colors.text, flex: 1 }]}
        numberOfLines={1}
      >
        {album.title}
      </Text>
      <Text style={[typography.subhead, { color: colors.textSecondary }]}>
        {album.count.toLocaleString()}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  cover: {
    borderRadius: 14,
    overflow: "hidden",
  },
  coverFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    borderRadius: 14,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  rowThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: "hidden",
  },
});
