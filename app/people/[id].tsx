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
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../src/theme/ThemeProvider";
import { GlassView } from "../../src/components/GlassView";
import { usePhotos, type Photo } from "../../src/hooks/usePhotos";
import { usePeople } from "../../src/hooks/usePeople";
import { photoToParams } from "../../src/utils/photoParams";

const COLUMNS = 3;

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { photos } = usePhotos();
  const { persons, renamePerson, mergePerson, reload } = usePeople(photos);

  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const inputRef = useRef<TextInput>(null);

  // Refresh on focus so renames made here survive navigating away and back.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

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
    if (!trimmed || !id) {
      setEditing(false);
      return;
    }

    const existing = persons.find(
      (p) => p.id !== id && p.name?.toLowerCase() === trimmed.toLowerCase(),
    );

    if (existing) {
      Alert.alert(
        "Merge People?",
        `Do you want to merge this person into "${existing.name}"?`,
        [
          { text: "Cancel", style: "cancel", onPress: () => setEditing(false) },
          {
            text: "Merge",
            style: "destructive",
            onPress: async () => {
              await mergePerson(id, existing.id);
              router.back();
            },
          },
        ],
      );
      return;
    }

    await renamePerson(id, trimmed);
    setEditing(false);
  }, [nameInput, id, renamePerson, persons, mergePerson]);

  const [inSelectMode, setInSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((photoId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }, []);

  const handleRemoveSelected = useCallback(async () => {
    if (!id || selectedIds.size === 0) return;
    Alert.alert(
      "Remove Faces?",
      `Are you sure you want to remove ${selectedIds.size} photo(s) from this person?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Remove", 
          style: "destructive",
          onPress: async () => {
            await removePersonPhotos(id, Array.from(selectedIds));
            setInSelectMode(false);
            setSelectedIds(new Set());
          }
        }
      ]
    );
  }, [id, selectedIds, removePersonPhotos]);

  const tileSize = Math.floor(width / COLUMNS);
  const headerH = insets.top + 52;

  const renderItem = useCallback(
    ({ item }: { item: Photo }) => {
      const isSelected = selectedIds.has(item.id);
      return (
        <Pressable
          onLongPress={() => {
            setInSelectMode(true);
            toggleSelect(item.id);
          }}
          onPress={() => {
            if (inSelectMode) toggleSelect(item.id);
            else router.push({ pathname: "/photo/[id]", params: { ...photoToParams(item) } });
          }}
          style={{ width: tileSize, height: tileSize, padding: 1 }}
        >
          <Image
            source={{ uri: item.uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={item.id}
          />
          {inSelectMode && (
            <View style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}>
              {isSelected && <Ionicons name="checkmark" size={14} color="#000" />}
            </View>
          )}
        </Pressable>
      );
    },
    [tileSize, inSelectMode, selectedIds, toggleSelect],
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
        {inSelectMode ? (
          <>
            <Pressable
              onPress={() => {
                setInSelectMode(false);
                setSelectedIds(new Set());
              }}
              hitSlop={12}
              style={styles.backBtn}
            >
              <Text style={[typography.body, { color: colors.accent }]}>Cancel</Text>
            </Pressable>
            <View style={styles.titleArea}>
              <Text style={[typography.headline, { color: colors.text, textAlign: "center" }]}>
                {selectedIds.size > 0 ? `${selectedIds.size} Selected` : "Select Photos"}
              </Text>
            </View>
            <Pressable
              onPress={() => setSelectedIds(new Set(personPhotos.map((p) => p.id)))}
              hitSlop={12}
              style={[styles.backBtn, { minWidth: 60, alignItems: "flex-end" }]}
            >
              <Text style={[typography.body, { color: colors.accent }]}>All</Text>
            </Pressable>
          </>
        ) : (
          <>
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

            <Pressable onPress={() => setInSelectMode(true)} hitSlop={12} style={styles.backBtn}>
              <Text style={[typography.body, { color: colors.accent }]}>Select</Text>
            </Pressable>
          </>
        )}
      </GlassView>

      {inSelectMode && (
        <View style={[styles.toolbar, { bottom: insets.bottom + 12 }]}>
          <Pressable
            onPress={handleRemoveSelected}
            disabled={selectedIds.size === 0}
            style={({ pressed }) => [
              styles.toolbarBtn,
              { opacity: selectedIds.size === 0 ? 0.4 : pressed ? 0.7 : 1 }
            ]}
          >
            <Ionicons name="person-remove" size={20} color="#FF453A" />
            <Text style={[typography.subhead, { color: "#FF453A", marginLeft: 8 }]}>Not This Person</Text>
          </Pressable>
        </View>
      )}
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
  checkCircle: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.9)",
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleSelected: {
    backgroundColor: "#FFF",
    borderColor: "#FFF",
  },
  toolbar: {
    position: "absolute",
    left: 16,
    right: 16,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(30,30,30,0.85)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  toolbarBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
});
