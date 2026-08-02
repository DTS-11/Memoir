import { useEffect, useMemo, useRef } from "react";
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
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../src/theme/ThemeProvider";
import { addTabScrollToTopListener } from "../../src/hooks/useTabScrollToTop";
import { TopGlassBar } from "../../src/components/TopGlassBar";
import { EmptyState } from "../../src/components/EmptyState";
import { usePhotos, type Photo } from "../../src/hooks/usePhotos";
import { photoToParams } from "../../src/utils/photoParams";

type Memory = {
  id: string;
  title: string;
  subtitle: string;
  photos: Photo[];
};

function buildMemories(photos: Photo[]): Memory[] {
  if (photos.length === 0) return [];

  const byMonth = new Map<string, Photo[]>();
  for (const p of photos) {
    const d = new Date(p.creationTime);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    const arr = byMonth.get(k) ?? [];
    arr.push(p);
    byMonth.set(k, arr);
  }

  const months = Array.from(byMonth.entries())
    .filter(([, arr]) => arr.length >= 4)
    .slice(0, 6);

  const monthNames = [
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

  return months.map(([key, arr]) => {
    const [year, month] = key.split("-").map(Number);
    return {
      id: key,
      title: `${monthNames[month]} ${year}`,
      subtitle: `${arr.length} photos`,
      photos: arr,
    };
  });
}

type OnThisDayGroup = { year: number; photos: Photo[] };

function buildOnThisDay(photos: Photo[]): OnThisDayGroup[] {
  const now = new Date();
  const groups = new Map<number, Photo[]>();
  for (const p of photos) {
    const d = new Date(p.creationTime);
    if (d.getFullYear() >= now.getFullYear()) continue;
    if (d.getMonth() !== now.getMonth() || d.getDate() !== now.getDate()) continue;
    const arr = groups.get(d.getFullYear()) ?? [];
    arr.push(p);
    groups.set(d.getFullYear(), arr);
  }
  return Array.from(groups.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, arr]) => ({ year, photos: arr.slice(0, 20) }));
}

export default function ForYou() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { photos, favoritePhotos, permission } = usePhotos();
  const { width } = useWindowDimensions();
  const memories = useMemo(() => buildMemories(photos), [photos]);
  const onThisDay = useMemo(() => buildOnThisDay(photos), [photos]);
  const enabled = permission === "granted" || permission === "limited";
  const scrollRef = useRef<ScrollView>(null);
  const hero = memories[0];
  const restMemories = memories.slice(1);
  const featured = favoritePhotos.length > 0 ? favoritePhotos : photos;

  useEffect(() => {
    return addTabScrollToTopListener("for-you", () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  }, []);

  if (!enabled) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <TopGlassBar title="For You" />
        <EmptyState
          icon="sparkles-outline"
          title="Memories will live here"
          body="Allow photo access to surface highlights from your library."
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
        contentContainerStyle={{
          paddingTop: insets.top + 80,
          paddingBottom: insets.bottom + 110,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={[
            typography.title2,
            { color: colors.text, marginHorizontal: 16, marginBottom: 12 },
          ]}
        >
          Memories
        </Text>

        {hero ? (
          <>
            <MemoryHero memory={hero} width={width - 32} />
            {restMemories.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={(width - 32) * 0.68 + 12}
                contentContainerStyle={{
                  paddingHorizontal: 16,
                  gap: 12,
                  marginTop: 12,
                }}
              >
                {restMemories.map((m) => (
                  <MemoryCard key={m.id} memory={m} width={(width - 32) * 0.68} />
                ))}
              </ScrollView>
            )}
          </>
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            <Text style={[typography.body, { color: colors.textSecondary }]}>
              Memories will appear here as your library grows — tap a month with several
              photos and we'll surface it automatically.
            </Text>
          </View>
        )}

        {onThisDay.length > 0 && (
          <>
            <Text
              style={[
                typography.title2,
                {
                  color: colors.text,
                  marginHorizontal: 16,
                  marginTop: 28,
                  marginBottom: 4,
                },
              ]}
            >
              On This Day
            </Text>
            {onThisDay.map((g) => (
              <View key={g.year} style={styles.otdGroup}>
                <Text
                  style={[
                    typography.subhead,
                    {
                      color: colors.textSecondary,
                      marginHorizontal: 16,
                      marginBottom: 8,
                    },
                  ]}
                >
                  {g.year} · {g.photos.length} photo{g.photos.length === 1 ? "" : "s"}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
                >
                  {g.photos.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() =>
                        router.push({
                          pathname: "/photo/[id]",
                          params: { ...photoToParams(p) },
                        })
                      }
                      style={[
                        styles.feature,
                        { backgroundColor: colors.thumbPlaceholder },
                      ]}
                    >
                      <Image
                        source={{ uri: p.uri }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                      />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ))}
          </>
        )}

        <Text
          style={[
            typography.title2,
            {
              color: colors.text,
              marginHorizontal: 16,
              marginTop: 28,
              marginBottom: 12,
            },
          ]}
        >
          {favoritePhotos.length > 0 ? "Favorites" : "Featured Photos"}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {featured.slice(0, 12).map((p) => (
            <Pressable
              key={p.id}
              onPress={() =>
                router.push({ pathname: "/photo/[id]", params: { ...photoToParams(p) } })
              }
              style={[styles.feature, { backgroundColor: colors.thumbPlaceholder }]}
            >
              <Image
                source={{ uri: p.uri }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            </Pressable>
          ))}
        </ScrollView>
      </ScrollView>
      <TopGlassBar title="For You" />
    </View>
  );
}

function MemoryCard({ memory, width }: { memory: Memory; width: number }) {
  const cover = memory.photos[0];
  return (
    <Pressable
      onPress={() =>
        cover &&
        router.push({ pathname: "/photo/[id]", params: { ...photoToParams(cover) } })
      }
      style={({ pressed }) => [
        styles.memCard,
        { width, height: width * 1.0 },
        pressed && { opacity: 0.85 },
      ]}
    >
      {cover && (
        <Image
          source={{ uri: cover.uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      )}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.72)"]}
        style={[StyleSheet.absoluteFill, { top: "50%" }]}
      />
      <View style={styles.memText}>
        <Text style={styles.memTitle}>{memory.title}</Text>
        <Text style={styles.memSubtitle}>{memory.subtitle}</Text>
      </View>
    </Pressable>
  );
}

function MemoryHero({ memory, width }: { memory: Memory; width: number }) {
  const cover = memory.photos[0];
  return (
    <Pressable
      onPress={() =>
        cover &&
        router.push({ pathname: "/photo/[id]", params: { ...photoToParams(cover) } })
      }
      style={({ pressed }) => [
        styles.memHero,
        { width, height: width * 1.15, marginHorizontal: 16 },
        pressed && { opacity: 0.9 },
      ]}
    >
      {cover && (
        <Image
          source={{ uri: cover.uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      )}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.78)"]}
        style={[StyleSheet.absoluteFill, { top: "42%" }]}
      />
      <View style={styles.memHeroText}>
        <Text style={styles.memHeroEyebrow}>Memory Moment</Text>
        <Text style={styles.memHeroTitle}>{memory.title}</Text>
        <Text style={styles.memSubtitle}>{memory.subtitle}</Text>
        <View style={styles.memHeroChip}>
          <Ionicons name="play" size={12} color="#000" />
          <Text style={styles.memHeroChipText}>View</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  memCard: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#222",
    justifyContent: "flex-end",
  },
  memHero: {
    borderRadius: 24,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: "#222",
    justifyContent: "flex-end",
  },
  memText: {
    padding: 14,
  },
  memTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  memSubtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "500",
    marginTop: 2,
  },
  memHeroText: {
    padding: 20,
  },
  memHeroEyebrow: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
    marginBottom: 6,
  },
  memHeroTitle: {
    color: "#FFF",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  memHeroChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 12,
    backgroundColor: "#FFF",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  memHeroChipText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "700",
  },
  otdGroup: {
    marginTop: 14,
    gap: 8,
  },
  feature: {
    width: 140,
    height: 180,
    borderRadius: 14,
    overflow: "hidden",
  },
});
