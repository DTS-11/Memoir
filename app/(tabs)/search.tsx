import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../src/theme/ThemeProvider";
import { addTabScrollToTopListener } from "../../src/hooks/useTabScrollToTop";
import { TopGlassBar } from "../../src/components/TopGlassBar";
import { usePhotos, type Photo } from "../../src/hooks/usePhotos";
import { EmptyState } from "../../src/components/EmptyState";
import { categories } from "../../src/utils/categories";
import { photoToParams } from "../../src/utils/photoParams";

export default function SearchScreen() {
  const { colors, typography, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { permission, photos } = usePhotos();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const enabled = permission === "granted" || permission === "limited";
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    return addTabScrollToTopListener("search", () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  }, []);

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
        const monthName = d.toLocaleString(undefined, { month: "long" }).toLowerCase();
        if (monthName.includes(q)) return true;
        if (String(d.getFullYear()).includes(q)) return true;
        return false;
      })
      .slice(0, 60);
  }, [photos, query]);

  if (!enabled) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <TopGlassBar title="Search" />
        <EmptyState
          icon="search-outline"
          title="Search needs your library"
          body="Allow photo access to search by date, file name, and category."
          actionLabel="Allow Photo Access"
          onAction={() => router.push("/permission")}
        />
      </View>
    );
  }

  const tileSize = (width - 32 - 8) / 3;

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scrollRef}
        keyboardDismissMode="on-drag"
        contentContainerStyle={{
          paddingTop: insets.top + 90,
          paddingBottom: insets.bottom + 110,
          paddingHorizontal: 16,
        }}
        showsVerticalScrollIndicator={false}
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
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Photos, Albums, and More"
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, { color: colors.text }]}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>

        {query.length === 0 ? (
          <>
            <Text
              style={[
                typography.title3,
                { color: colors.text, marginTop: 22, marginBottom: 10 },
              ]}
            >
              Categories
            </Text>
            <View style={[styles.catList, { backgroundColor: colors.surfaceElevated }]}>
              {categoryCounts.map((c, i) => {
                if (c.count === 0) return null;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() =>
                      router.push({
                        pathname: "/category/[key]",
                        params: { key: c.key },
                      })
                    }
                    style={({ pressed }) => [
                      styles.catRow,
                      i < categories.length - 1 && {
                        borderBottomColor: colors.separator,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                      },
                      pressed && { backgroundColor: colors.surface },
                    ]}
                  >
                    <View
                      style={[styles.catIcon, { backgroundColor: colors.accentMuted }]}
                    >
                      <Ionicons name={c.icon} size={18} color={colors.accent} />
                    </View>
                    <Text style={[typography.body, { color: colors.text, flex: 1 }]}>
                      {c.label}
                    </Text>
                    <Text
                      style={[
                        typography.subhead,
                        { color: colors.textSecondary, marginRight: 6 },
                      ]}
                    >
                      {c.count.toLocaleString()}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={colors.textTertiary}
                    />
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <Text
              style={[
                typography.subhead,
                { color: colors.textSecondary, marginTop: 16, marginBottom: 8 },
              ]}
            >
              {filtered.length} result{filtered.length === 1 ? "" : "s"}
            </Text>
            <View style={styles.results}>
              {filtered.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() =>
                    router.push({
                      pathname: "/photo/[id]",
                      params: { ...photoToParams(p) },
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
        )}
      </ScrollView>
      <TopGlassBar title="Search" />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 10,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
  catList: {
    borderRadius: 14,
    overflow: "hidden",
  },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  catIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  results: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  resultTile: {
    flex: 1,
    borderRadius: 6,
    overflow: "hidden",
  },
});
