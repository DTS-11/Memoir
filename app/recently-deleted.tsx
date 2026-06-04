import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePhotos, type RecentlyDeletedPhoto } from "../src/hooks/usePhotos";
import { useTheme } from "../src/theme/ThemeProvider";
import { GlassView } from "../src/components/GlassView";

function daysAgo(timestamp: number): string {
  const days = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

const COLS = 3;

export default function RecentlyDeletedScreen() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { deletedItems, restoreDeletedPhoto, deletePhotoForever } = usePhotos();
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);

  const tileSize = width / COLS;

  const toggleSelect = useCallback((id: string) => {
    Haptics.selectionAsync();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const enterSelect = useCallback((id?: string) => {
    setSelecting(true);
    if (id) {
      setSelected(new Set([id]));
      Haptics.selectionAsync();
    }
  }, []);

  const cancelSelect = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
  }, []);

  const selectAll = useCallback(() => {
    Haptics.selectionAsync();
    setSelected(new Set(deletedItems.map((item) => item.id)));
  }, [deletedItems]);

  const restoreSelected = useCallback(() => {
    const ids = Array.from(selected);
    ids.forEach((id) => restoreDeletedPhoto(id));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSelected(new Set());
    setSelecting(false);
  }, [selected, restoreDeletedPhoto]);

  const deleteSelectedForever = useCallback(() => {
    const count = selected.size;
    Alert.alert(
      `Delete ${count} Item${count === 1 ? "" : "s"} Forever?`,
      "These items will be permanently deleted and cannot be recovered.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Forever",
          style: "destructive",
          onPress: async () => {
            for (const id of Array.from(selected)) {
              await deletePhotoForever(id);
            }
            setSelected(new Set());
            setSelecting(false);
          },
        },
      ],
    );
  }, [selected, deletePhotoForever]);

  const recoverAll = useCallback(() => {
    if (deletedItems.length === 0) return;
    Alert.alert(
      `Recover All ${deletedItems.length} Item${deletedItems.length === 1 ? "" : "s"}?`,
      "All items will be restored to your library.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Recover All",
          onPress: () => {
            deletedItems.forEach((item) => restoreDeletedPhoto(item.id));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ],
    );
  }, [deletedItems, restoreDeletedPhoto]);

  const deleteAll = useCallback(() => {
    if (deletedItems.length === 0) return;
    Alert.alert(
      `Delete All ${deletedItems.length} Item${deletedItems.length === 1 ? "" : "s"} Forever?`,
      "All items will be permanently deleted and cannot be recovered.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            for (const item of [...deletedItems]) {
              await deletePhotoForever(item.id);
            }
          },
        },
      ],
    );
  }, [deletedItems, deletePhotoForever]);

  const renderItem = useCallback(
    ({ item }: { item: RecentlyDeletedPhoto }) => {
      const isSelected = selected.has(item.id);
      const isAudio = item.mediaType === "audio";
      return (
        <Pressable
          onPress={() => {
            if (selecting) {
              toggleSelect(item.id);
            } else {
              enterSelect(item.id);
            }
          }}
          onLongPress={() => {
            if (!selecting) enterSelect(item.id);
          }}
          style={[styles.tile, { width: tileSize, height: tileSize }]}
        >
          {isAudio ? (
            <View style={styles.audioPlaceholder}>
              <Ionicons
                name="musical-notes"
                size={tileSize * 0.3}
                color="rgba(255,255,255,0.45)"
              />
            </View>
          ) : (
            <Image
              source={{ uri: item.uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              recyclingKey={item.id}
            />
          )}
          <View style={styles.tileGradient} />
          <Text style={styles.tileAge}>{daysAgo(item.deletedAt)}</Text>
          {selecting && (
            <View
              style={[
                styles.checkCircle,
                isSelected && styles.checkCircleSelected,
              ]}
            >
              {isSelected && (
                <Ionicons name="checkmark" size={13} color="#000" />
              )}
            </View>
          )}
          {selecting && isSelected && <View style={styles.selectedOverlay} />}
        </Pressable>
      );
    },
    [selecting, selected, tileSize, toggleSelect, enterSelect],
  );

  const keyExtractor = useCallback((item: RecentlyDeletedPhoto) => item.id, []);

  const hasSelection = selected.size > 0;

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 10,
            backgroundColor: colors.background,
            borderBottomColor: colors.separator,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.headerSide}
        >
          <Ionicons name="chevron-back" size={24} color={colors.accent} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[typography.headline, { color: colors.text }]}>
            Recently Deleted
          </Text>
          {deletedItems.length > 0 && (
            <Text
              style={[
                typography.footnote,
                { color: colors.textSecondary, marginTop: 1 },
              ]}
            >
              {deletedItems.length} item{deletedItems.length === 1 ? "" : "s"}
            </Text>
          )}
        </View>
        <Pressable
          onPress={selecting ? cancelSelect : () => enterSelect()}
          hitSlop={12}
          style={styles.headerSide}
          disabled={deletedItems.length === 0}
        >
          <Text
            style={[
              typography.body,
              {
                color:
                  deletedItems.length === 0
                    ? colors.textTertiary
                    : colors.accent,
              },
            ]}
          >
            {selecting ? "Done" : "Select"}
          </Text>
        </Pressable>
      </View>

      {deletedItems.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons
            name="trash-outline"
            size={56}
            color={colors.textTertiary}
          />
          <Text
            style={[
              typography.title3,
              { color: colors.text, marginTop: 18, textAlign: "center" },
            ]}
          >
            No Recently Deleted Items
          </Text>
          <Text
            style={[
              typography.subhead,
              {
                color: colors.textSecondary,
                marginTop: 8,
                textAlign: "center",
              },
            ]}
          >
            Photos you delete will appear here so you can restore them.
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            data={deletedItems}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            numColumns={COLS}
            contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
          />

          <GlassView
            intensity={80}
            bordered
            style={[
              styles.toolbar,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            {selecting ? (
              <>
                <Pressable
                  onPress={selectAll}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.toolbarBtn,
                    pressed && { opacity: 0.55 },
                  ]}
                >
                  <Text style={[typography.subhead, { color: colors.accent }]}>
                    Select All
                  </Text>
                </Pressable>
                <View style={styles.toolbarActions}>
                  <Pressable
                    onPress={hasSelection ? restoreSelected : undefined}
                    disabled={!hasSelection}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.toolbarBtn,
                      !hasSelection && styles.toolbarBtnDisabled,
                      pressed && { opacity: 0.55 },
                    ]}
                  >
                    <Text
                      style={[
                        typography.subhead,
                        {
                          color: hasSelection
                            ? colors.accent
                            : colors.textTertiary,
                        },
                      ]}
                    >
                      Recover{hasSelection ? ` (${selected.size})` : ""}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={hasSelection ? deleteSelectedForever : undefined}
                    disabled={!hasSelection}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.toolbarBtn,
                      !hasSelection && styles.toolbarBtnDisabled,
                      pressed && { opacity: 0.55 },
                    ]}
                  >
                    <Text
                      style={[
                        typography.subhead,
                        {
                          color: hasSelection ? "#FF453A" : colors.textTertiary,
                        },
                      ]}
                    >
                      Delete{hasSelection ? ` (${selected.size})` : ""}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Pressable
                  onPress={recoverAll}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.toolbarBtn,
                    pressed && { opacity: 0.55 },
                  ]}
                >
                  <Text style={[typography.subhead, { color: colors.accent }]}>
                    Recover All
                  </Text>
                </Pressable>
                <Pressable
                  onPress={deleteAll}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.toolbarBtn,
                    pressed && { opacity: 0.55 },
                  ]}
                >
                  <Text style={[typography.subhead, { color: "#FF453A" }]}>
                    Delete All
                  </Text>
                </Pressable>
              </>
            )}
          </GlassView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSide: {
    width: 72,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  tile: {
    overflow: "hidden",
  },
  audioPlaceholder: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  tileGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 36,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  tileAge: {
    position: "absolute",
    bottom: 5,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "rgba(255,255,255,0.92)",
    fontSize: 10,
    fontWeight: "600",
  },
  checkCircle: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.85)",
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleSelected: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderColor: "rgba(255,255,255,0.96)",
  },
  selectedOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  toolbar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  toolbarBtn: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  toolbarBtnDisabled: {
    opacity: 0.35,
  },
  toolbarActions: {
    flexDirection: "row",
    gap: 20,
  },
});
