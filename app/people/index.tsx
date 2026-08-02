import React, { memo, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../src/theme/ThemeProvider";
import { TopGlassBar } from "../../src/components/TopGlassBar";
import { EmptyState } from "../../src/components/EmptyState";
import { usePhotos } from "../../src/hooks/usePhotos";
import { usePeople, type PersonWithCover } from "../../src/hooks/usePeople";

const COLS = 3;
const GAP = 8;
const PADDING = 16;

export default function AllPeopleScreen() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { photos } = usePhotos();
  const { persons, loading, reload } = usePeople(photos);

  // Refresh whenever the screen regains focus so renames made on the detail
  // page (or a completed background scan) show up here immediately.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const tileSize = (width - PADDING * 2 - GAP * (COLS - 1)) / COLS;
  const avatarSize = tileSize * 0.74;

  const sorted = useMemo(
    () => [...persons].sort((a, b) => b.photoIds.length - a.photoIds.length),
    [persons],
  );

  const onPressPerson = useCallback((p: PersonWithCover) => {
    router.push({ pathname: "/people/[id]", params: { id: p.id } });
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: PersonWithCover }) => (
      <PersonTile
        person={item}
        size={tileSize}
        avatarSize={avatarSize}
        onPress={onPressPerson}
      />
    ),
    [tileSize, avatarSize, onPressPerson],
  );

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      {sorted.length === 0 && !loading ? (
        <View style={[styles.fill, { paddingTop: insets.top + 64 }]}>
          <EmptyState
            icon="people-outline"
            title="No People Yet"
            body="Scan for faces in Browse → People to group your photos by who's in them."
          />
        </View>
      ) : (
        <FlashList
          data={sorted}
          numColumns={COLS}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingTop: insets.top + 64 + 16,
            paddingHorizontal: PADDING,
            paddingBottom: insets.bottom + 32,
            gap: 18,
          }}
          ListEmptyComponent={
            loading ? (
              <View style={{ alignItems: "center", padding: 32 }}>
                <Ionicons name="sync" size={22} color={colors.textTertiary} />
              </View>
            ) : null
          }
        />
      )}

      <View pointerEvents="box-none" style={styles.topBlock}>
        <TopGlassBar
          title="People"
          subtitle={`${sorted.length} group${sorted.length === 1 ? "" : "s"}`}
          right={
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Ionicons name="chevron-back-circle" size={28} color={colors.accent} />
            </Pressable>
          }
        />
      </View>
    </View>
  );
}

const PersonTile = memo(function PersonTile({
  person,
  size,
  avatarSize,
  onPress,
}: {
  person: PersonWithCover;
  size: number;
  avatarSize: number;
  onPress: (p: PersonWithCover) => void;
}) {
  const { colors, typography } = useTheme();
  const displayName = person.name ?? `Person ${person.id.slice(-4).toUpperCase()}`;
  const handlePress = useCallback(() => onPress(person), [onPress, person]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.tile, { width: size, opacity: pressed ? 0.75 : 1 }]}
    >
      <View style={[styles.avatarWrap, { width: avatarSize, height: avatarSize }]}>
        {person.coverThumbUri ? (
          <Image
            source={{ uri: person.coverThumbUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={person.id}
            transition={0}
            cachePolicy="memory-disk"
            allowDownscaling
          />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: colors.surface }]}>
            <Text style={[styles.avatarInitial, { color: colors.textSecondary }]}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <Text
        numberOfLines={1}
        style={[typography.caption1, { color: colors.text, marginTop: 8 }]}
      >
        {displayName}
      </Text>
      <Text style={[typography.caption2, { color: colors.textSecondary }]}>
        {person.photoIds.length} photo{person.photoIds.length === 1 ? "" : "s"}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBlock: { position: "absolute", top: 0, left: 0, right: 0 },
  tile: {
    alignItems: "center",
  },
  avatarWrap: {
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#222",
  },
  avatarFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 26,
    fontWeight: "600",
  },
});
