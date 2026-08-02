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

export default function ForYou() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { photos, permission } = usePhotos();
  const { width } = useWindowDimensions();
  const memories = useMemo(() => buildMemories(photos), [photos]);
  const enabled = permission === "granted" || permission === "limited";
  const scrollRef = useRef<ScrollView>(null);

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

        {memories.length === 0 ? (
          <View style={{ paddingHorizontal: 16 }}>
            <Text style={[typography.body, { color: colors.textSecondary }]}>
              Memories will appear here as your library grows.
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={width - 32 + 12}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
          >
            {memories.map((m) => (
              <MemoryCard key={m.id} memory={m} width={width - 32} />
            ))}
          </ScrollView>
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
          Featured Photos
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {photos.slice(0, 12).map((p) => (
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
        cover && router.push({ pathname: "/photo/[id]", params: { ...photoToParams(cover) } })
      }
      style={[styles.memCard, { width, height: width * 1.05 }]}
    >
      {cover && (
        <Image
          source={{ uri: cover.uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      )}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.7)"]}
        style={[StyleSheet.absoluteFill, { top: "55%" }]}
      />
      <View style={styles.memText}>
        <Text style={styles.memTitle}>{memory.title}</Text>
        <Text style={styles.memSubtitle}>{memory.subtitle}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  memCard: {
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#222",
    justifyContent: "flex-end",
  },
  memText: {
    padding: 20,
  },
  memTitle: {
    color: "#FFF",
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  memSubtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    fontWeight: "500",
    marginTop: 4,
  },
  feature: {
    width: 140,
    height: 180,
    borderRadius: 14,
    overflow: "hidden",
  },
});
