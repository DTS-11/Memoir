import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../src/theme/ThemeProvider";
import { addTabScrollToTopListener } from "../../src/hooks/useTabScrollToTop";
import { useAlbums, type AlbumPreview } from "../../src/hooks/useAlbums";
import { usePhotos, type Photo } from "../../src/hooks/usePhotos";
import { categories } from "../../src/utils/categories";
import { GlassView } from "../../src/components/GlassView";
import { semantic } from "../../src/theme/tokens";

// ── memory helpers ────────────────────────────────────────────────────────────

type Memory = { id: string; title: string; subtitle: string; photos: Photo[] };

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function buildMemories(photos: Photo[]): Memory[] {
  const byMonth = new Map<string, Photo[]>();
  for (const p of photos) {
    const d = new Date(p.creationTime);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    const arr = byMonth.get(k) ?? [];
    arr.push(p);
    byMonth.set(k, arr);
  }
  return Array.from(byMonth.entries())
    .filter(([, arr]) => arr.length >= 4)
    .slice(0, 6)
    .map(([key, arr]) => {
      const [year, month] = key.split("-").map(Number);
      return {
        id: key,
        title: `${MONTH_NAMES[month]} ${year}`,
        subtitle: `${arr.length} photos`,
        photos: arr,
      };
    });
}

// ── main screen ───────────────────────────────────────────────────────────────

// Height of the floating search bar (excluding safe-area top).
const SEARCH_BAR_H = 58;

export default function BrowseScreen() {
  const { colors, typography, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { permission, photos, favoritePhotos, archivedPhotos, deletedItems } =
    usePhotos();
  const enabled = permission === "granted" || permission === "limited";
  const { albums, smart } = useAlbums(enabled);
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  const cardW = (width - 16 * 2 - 8 * 2) / 3;
  const tileSize = (width - 32 - 8) / 3;
  const memCardW = Math.min(width - 64, 320);

  const memories = useMemo(() => buildMemories(photos), [photos]);

  const categoryCounts = useMemo(
    () =>
      categories.map((c) => ({
        ...c,
        count: photos.reduce((n, p) => n + (c.match(p) ? 1 : 0), 0),
      })),
    [photos],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as Photo[];
    return photos
      .filter((p) => {
        if (p.filename.toLowerCase().includes(q)) return true;
        const d = new Date(p.creationTime);
        const monthName = d
          .toLocaleString(undefined, { month: "long" })
          .toLowerCase();
        if (monthName.includes(q)) return true;
        if (String(d.getFullYear()).includes(q)) return true;
        return false;
      })
      .slice(0, 60);
  }, [photos, query]);

  useEffect(() => {
    return addTabScrollToTopListener("albums", () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  }, []);

  const openAlbum = useCallback((a: AlbumPreview) => {
    if (a.type === "smart") {
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

  const openFavorites = useCallback(() => router.push("/favorites"), []);
  const openArchive = useCallback(() => router.push("/archive"), []);
  const openRecentlyDeleted = useCallback(() => router.push("/recently-deleted"), []);

  // top padding = safe area + search bar height + small gap
  const scrollTopPad = insets.top + SEARCH_BAR_H + 8;

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scrollRef}
        keyboardDismissMode="on-drag"
        removeClippedSubviews
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: scrollTopPad,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        {query.length > 0 ? (
          /* ── search results ─────────────────────────────────────────────── */
          <>
            <Text
              style={[
                typography.subhead,
                { color: colors.textSecondary, marginBottom: 10 },
              ]}
            >
              {filtered.length} result{filtered.length === 1 ? "" : "s"}
            </Text>
            <View style={styles.resultsGrid}>
              {filtered.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() =>
                    router.push({
                      pathname: "/photo/[id]",
                      params: { id: p.id },
                    })
                  }
                  style={{ width: tileSize, height: tileSize, padding: 2 }}
                >
                  <View
                    style={[
                      styles.resultTile,
                      { backgroundColor: colors.thumbPlaceholder },
                    ]}
                  >
                    <Image
                      source={{ uri: p.uri }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          /* ── browse sections ────────────────────────────────────────────── */
          <>
            {/* Memories */}
            {memories.length > 0 && (
              <>
                <SectionTitle title="Memories" />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  nestedScrollEnabled
                  decelerationRate="fast"
                  snapToInterval={memCardW + 12}
                  contentContainerStyle={{
                    gap: 12,
                    paddingRight: 4,
                    marginBottom: 4,
                  }}
                  style={{ marginHorizontal: -16, paddingHorizontal: 16 }}
                >
                  {memories.map((m) => (
                    <MemoryCard key={m.id} memory={m} width={memCardW} />
                  ))}
                </ScrollView>
              </>
            )}

            {/* My Albums */}
            {albums.length > 0 && (
              <>
                <SectionTitle title="My Albums" />
                <View style={styles.albumGrid}>
                  {albums.map((a) => (
                    <AlbumCard
                      key={a.id}
                      album={a}
                      width={cardW}
                      onPress={openAlbum}
                    />
                  ))}
                </View>
              </>
            )}

            {/* Media Types */}
            {smart.length > 0 && (
              <>
                <SectionTitle title="Media Types" />
                <View
                  style={[
                    styles.list,
                    { backgroundColor: colors.surfaceElevated },
                  ]}
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
              </>
            )}

            {/* Utilities */}
            <SectionTitle title="Utilities" />
            <View
              style={[styles.list, { backgroundColor: colors.surfaceElevated }]}
            >
              <UtilityRow
                icon="heart"
                iconColor={semantic.favorite}
                iconBg={semantic.favoriteMuted}
                label="Favorites"
                count={favoritePhotos.length}
                coverUri={favoritePhotos[0]?.uri}
                divider
                onPress={openFavorites}
              />
              <UtilityRow
                icon="archive"
                iconColor={semantic.archive}
                iconBg={semantic.archiveMuted}
                label="Archive"
                count={archivedPhotos.length}
                coverUri={archivedPhotos[0]?.uri}
                divider
                onPress={openArchive}
              />
              <UtilityRow
                icon="trash"
                iconColor={semantic.delete}
                iconBg={semantic.deleteMuted}
                label="Recently Deleted"
                count={deletedItems.length}
                onPress={openRecentlyDeleted}
              />
            </View>

            {/* Categories */}
            {categoryCounts.some((c) => c.count > 0) && (
              <>
                <SectionTitle title="Categories" />
                <View
                  style={[
                    styles.list,
                    { backgroundColor: colors.surfaceElevated },
                  ]}
                >
                  {categoryCounts.map((c, i) => {
                    if (c.count === 0) return null;
                    return (
                      <CategoryRow
                        key={c.key}
                        cat={c}
                        divider={i < categoryCounts.length - 1}
                      />
                    );
                  })}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* ── floating search bar ──────────────────────────────────────────────── */}
      <GlassView
        intensity={80}
        style={[
          styles.searchHeader,
          {
            paddingTop: insets.top + 10,
            borderBottomColor: colors.glassBorder,
          },
        ]}
      >
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: isDark
                ? "rgba(118,118,128,0.24)"
                : "rgba(118,118,128,0.12)",
            },
          ]}
        >
          <Ionicons name="search" size={17} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search photos, albums, dates…"
            placeholderTextColor={colors.textTertiary}
            style={[styles.searchInput, { color: colors.text }]}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={10}>
              <Ionicons
                name="close-circle"
                size={17}
                color={colors.textTertiary}
              />
            </Pressable>
          )}
        </View>
      </GlassView>
    </View>
  );
}

// ── sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ title }: { title: string }) {
  const { colors, typography } = useTheme();
  return (
    <Text
      style={[
        typography.title2,
        { color: colors.text, marginTop: 24, marginBottom: 12 },
      ]}
    >
      {title}
    </Text>
  );
}

const MemoryCard = memo(function MemoryCard({
  memory,
  width,
}: {
  memory: Memory;
  width: number;
}) {
  const cover = memory.photos[0];
  const onPress = useCallback(() => {
    if (cover) router.push({ pathname: "/photo/[id]", params: { id: cover.id } });
  }, [cover]);
  return (
    <Pressable onPress={onPress} style={[styles.memCard, { width, height: width * 0.72 }]}>
      {cover && (
        <Image
          source={{ uri: cover.uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      )}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.65)"]}
        style={[StyleSheet.absoluteFill, { top: "50%" }]}
      />
      <View style={styles.memText}>
        <Text style={styles.memTitle}>{memory.title}</Text>
        <Text style={styles.memSubtitle}>{memory.subtitle}</Text>
      </View>
    </Pressable>
  );
});

const AlbumCard = memo(function AlbumCard({
  album,
  width,
  onPress,
}: {
  album: AlbumPreview;
  width: number;
  onPress: (a: AlbumPreview) => void;
}) {
  const { colors, typography } = useTheme();
  const handlePress = useCallback(() => onPress(album), [onPress, album]);
  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        { width, marginBottom: 14, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View
        style={[
          styles.albumCover,
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
            style={[
              styles.albumCoverFallback,
              { backgroundColor: colors.surface },
            ]}
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
});

const SmartRow = memo(function SmartRow({
  album,
  divider,
  onPress,
}: {
  album: AlbumPreview;
  divider: boolean;
  onPress: (a: AlbumPreview) => void;
}) {
  const { colors, typography } = useTheme();
  const handlePress = useCallback(() => onPress(album), [onPress, album]);
  return (
    <Pressable
      onPress={handlePress}
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
        {album.coverUri && (
          <Image
            source={{ uri: album.coverUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        )}
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
      <Ionicons name="chevron-forward" size={17} color={colors.textTertiary} />
    </Pressable>
  );
});

const UtilityRow = memo(function UtilityRow({
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
          <View style={styles.rowThumbCenter}>
            <Ionicons name={icon} size={20} color={iconColor} />
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
      <Ionicons name="chevron-forward" size={17} color={colors.textTertiary} />
    </Pressable>
  );
});

type CategoryCount = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; count: number };

const CategoryRow = memo(function CategoryRow({
  cat,
  divider,
}: {
  cat: CategoryCount;
  divider: boolean;
}) {
  const { colors, typography } = useTheme();
  const onPress = useCallback(
    () => router.push({ pathname: "/category/[key]", params: { key: cat.key } }),
    [cat.key],
  );
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
      <View style={[styles.catIcon, { backgroundColor: colors.accentMuted }]}>
        <Ionicons name={cat.icon} size={17} color={colors.accent} />
      </View>
      <Text style={[typography.body, { color: colors.text, flex: 1 }]}>
        {cat.label}
      </Text>
      <Text
        style={[
          typography.subhead,
          { color: colors.textSecondary, marginRight: 6 },
        ]}
      >
        {cat.count.toLocaleString()}
      </Text>
      <Ionicons name="chevron-forward" size={17} color={colors.textTertiary} />
    </Pressable>
  );
});

// ── styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fill: { flex: 1 },

  // floating search bar
  searchHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 11,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },

  // albums grid
  albumGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  albumCover: {
    borderRadius: 14,
    overflow: "hidden",
  },
  albumCoverFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // shared list / row
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
  rowThumbCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // categories
  catIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  // memory cards
  memCard: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#222",
    justifyContent: "flex-end",
  },
  memText: {
    padding: 16,
  },
  memTitle: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  memSubtitle: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontWeight: "500",
    marginTop: 2,
  },

  // search results
  resultsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  resultTile: {
    flex: 1,
    borderRadius: 6,
    overflow: "hidden",
  },
});
