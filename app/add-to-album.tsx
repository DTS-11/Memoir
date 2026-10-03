import React, { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../src/theme/ThemeProvider";
import { GlassView } from "../src/components/GlassView";
import { useAlbums } from "../src/hooks/useAlbums";

export default function AddToAlbumScreen() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ ids: string }>();
  const assetIds = params.ids ? JSON.parse(params.ids) : [];
  
  // Enabled=true because we already checked permissions to be here
  const { albums, createAlbum, addToAlbum } = useAlbums(true);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = useCallback(async () => {
    const title = newAlbumName.trim();
    if (!title || assetIds.length === 0) return;
    
    await createAlbum(title, assetIds);
    router.back();
  }, [newAlbumName, assetIds, createAlbum]);

  const handleAddToAlbum = useCallback(
    async (albumId: string) => {
      await addToAlbum(albumId, assetIds);
      router.back();
    },
    [assetIds, addToAlbum],
  );

  return (
    <View style={styles.fill}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => router.back()} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom, backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Text style={[typography.title3, { color: colors.text, flex: 1 }]}>
            Add to Album
          </Text>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close-circle" size={24} color={colors.textTertiary} />
          </Pressable>
        </View>

        <View style={styles.createRow}>
          <Ionicons name="add-circle" size={24} color={colors.accent} />
          <TextInput
            value={newAlbumName}
            onChangeText={setNewAlbumName}
            placeholder="New Album Name..."
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, typography.body, { color: colors.text }]}
            onSubmitEditing={handleCreate}
            returnKeyType="done"
          />
          {newAlbumName.trim().length > 0 && (
            <Pressable onPress={handleCreate}>
              <Text style={[typography.body, { color: colors.accent, fontWeight: "600" }]}>Save</Text>
            </Pressable>
          )}
        </View>

        <FlatList
          data={albums}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handleAddToAlbum(item.id)}
              style={({ pressed }) => [
                styles.albumRow,
                pressed && { backgroundColor: colors.surface },
              ]}
            >
              <View style={[styles.coverWrap, { backgroundColor: colors.surfaceElevated }]}>
                {item.coverUri && (
                  <Image source={{ uri: item.coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                )}
              </View>
              <Text style={[typography.body, { color: colors.text }]}>{item.title}</Text>
            </Pressable>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    maxHeight: "80%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.3)",
  },
  createRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.3)",
    gap: 12,
  },
  input: {
    flex: 1,
    padding: 8,
  },
  albumRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.1)",
  },
  coverWrap: {
    width: 44,
    height: 44,
    borderRadius: 6,
    overflow: "hidden",
  },
});
