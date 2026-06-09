import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../src/theme/ThemeProvider";
import { GlassView } from "../../src/components/GlassView";
import { usePhotos } from "../../src/hooks/usePhotos";
import { usePeople } from "../../src/hooks/usePeople";

const COLUMNS = 3;

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { photos } = usePhotos();
  const { persons, renamePerson } = usePeople(photos);

  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const inputRef = useRef<TextInput>(null);

  const person = useMemo(() => persons.find((p) => p.id === id), [persons, id]);

  const displayName = person?.name ?? `Person ${id.slice(-4).toUpperCase()}`;

  const personPhotos = useMemo(() => {
    if (!person) return [];
    const idSet = new Set(person.photoIds);
    return photos.filter((p) => idSet.has(p.id));
  }, [person, photos]);

  useEffect(() => {
    if (editing) {
      setNameInput(person?.name ?? "");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [editing, person?.name]);

  const commitRename = useCallback(async () => {
    const trimmed = nameInput.trim();
    if (trimmed && id) await renamePerson(id, trimmed);
    setEditing(false);
  }, [nameInput, id, renamePerson]);

  const tileSize = Math.floor(width / COLUMNS);
  const headerH = insets.top + 52;

  const renderItem = useCallback(
    ({ item }: { item: { id: string; uri: string } }) => (
      <Pressable
        onPress={() => router.push({ pathname: "/photo/[id]", params: { id: item.id } })}
        style={{ width: tileSize, height: tileSize }}
      >
        <Image
          source={{ uri: item.uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          recyclingKey={item.id}
        />
      </Pressable>
    ),
    [tileSize],
  );

  if (!person) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <Text style={[typography.body, { color: colors.textSecondary, margin: 24 }]}>
          Person not found.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <FlashList
        data={personPhotos}
        numColumns={COLUMNS}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingTop: headerH, paddingBottom: insets.bottom + 80 }}
        ListEmptyComponent={
          <Text
            style={[
              typography.subhead,
              { color: colors.textSecondary, margin: 32, textAlign: "center" },
            ]}
          >
            No photos found for this person.
          </Text>
        }
      />

      {/* ── Floating header ─────────────────────────────────────────────── */}
      <GlassView
        intensity={80}
        style={[
          styles.header,
          { paddingTop: insets.top + 8, borderBottomColor: colors.glassBorder },
        ]}
      >
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.accent} />
        </Pressable>

        <View style={styles.titleArea}>
          {editing ? (
            <TextInput
              ref={inputRef}
              value={nameInput}
              onChangeText={setNameInput}
              onSubmitEditing={commitRename}
              onBlur={commitRename}
              returnKeyType="done"
              style={[
                typography.title3,
                styles.nameInput,
                { color: colors.text, borderBottomColor: colors.accent },
              ]}
              autoCapitalize="words"
              maxLength={40}
            />
          ) : (
            <Pressable onPress={() => setEditing(true)} style={styles.nameRow}>
              <Text style={[typography.title3, { color: colors.text }]}>
                {displayName}
              </Text>
              <Ionicons
                name="pencil"
                size={14}
                color={colors.textTertiary}
                style={{ marginLeft: 6, marginTop: 2 }}
              />
            </Pressable>
          )}
          <Text style={[typography.caption1, { color: colors.textSecondary }]}>
            {personPhotos.length} photo{personPhotos.length !== 1 ? "s" : ""}
          </Text>
        </View>
      </GlassView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    padding: 8,
  },
  titleArea: {
    flex: 1,
    marginLeft: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  nameInput: {
    borderBottomWidth: 1,
    paddingVertical: 2,
    minWidth: 120,
  },
});
