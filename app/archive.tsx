import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import * as LocalAuthentication from "expo-local-authentication";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePhotos, type Photo } from "../src/hooks/usePhotos";
import { useTheme } from "../src/theme/ThemeProvider";
import { GlassView } from "../src/components/GlassView";
import { EmptyState } from "../src/components/EmptyState";

const COLS = 3;

export default function ArchiveScreen() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { archivedPhotos, unarchivePhoto, moveToRecentlyDeletedBulk } = usePhotos();
  const { width } = useWindowDimensions();
  const [unlocked, setUnlocked] = useState(false);
  const didAttempt = useRef(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    if (didAttempt.current) return;
    didAttempt.current = true;
    (async () => {
      try {
        const hasHW = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (!hasHW || !enrolled) {
          setUnlocked(true);
          return;
        }
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Access Archive",
          cancelLabel: "Cancel",
          disableDeviceFallback: false,
        });
        if (result.success) setUnlocked(true);
        else router.back();
      } catch {
        setUnlocked(true);
      }
    })();
  }, []);

  const tileSize = width / COLS;

  const keyExtractor = useCallback((item: Photo) => item.id, []);
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: tileSize,
      offset: Math.floor(index / COLS) * tileSize,
      index,
    }),
    [tileSize],
  );
  const listPadding = useMemo(
    () => ({ paddingBottom: insets.bottom + 90 }),
    [insets.bottom],
  );

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
    setSelected(new Set(archivedPhotos.map((p) => p.id)));
  }, [archivedPhotos]);

  const restoreSelected = useCallback(() => {
    Array.from(selected).forEach((id) => unarchivePhoto(id));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSelected(new Set());
    setSelecting(false);
  }, [selected, unarchivePhoto]);

  const deleteSelected = useCallback(() => {
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
            const toDelete = archivedPhotos.filter((p) => selected.has(p.id));
            // unarchivePhoto uses a functional updater so forEach is safe here
            toDelete.forEach((p) => unarchivePhoto(p.id));
            // single bulk call avoids stale-closure issues
            moveToRecentlyDeletedBulk(toDelete);
            setSelected(new Set());
            setSelecting(false);
          },
        },
      ],
    );
  }, [selected, archivedPhotos, unarchivePhoto, moveToRecentlyDeletedBulk]);

  const renderItem = useCallback(
    ({ item }: { item: Photo }) => {
      const isSelected = selected.has(item.id);
      const isAudio = item.mediaType === "audio";
      return (
        <Pressable
          onPress={() => {
            if (selecting) toggleSelect(item.id);
            else enterSelect(item.id);
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
          {selecting && isSelected && <View style={styles.selectedOverlay} />}
          {selecting && (
            <View style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}>
              {isSelected && <Ionicons name="checkmark" size={13} color="#000" />}
            </View>
          )}
        </Pressable>
      );
    },
    [selecting, selected, tileSize, toggleSelect, enterSelect],
  );

  const hasSelection = selected.size > 0;

  if (!unlocked) {
    return <View style={[styles.fill, { backgroundColor: colors.background }]} />;
  }

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
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerSide}>
          <Ionicons name="chevron-back" size={24} color={colors.accent} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[typography.headline, { color: colors.text }]}>Archive</Text>
          {archivedPhotos.length > 0 && (
            <Text
              style={[typography.footnote, { color: colors.textSecondary, marginTop: 1 }]}
            >
              {archivedPhotos.length} item
              {archivedPhotos.length === 1 ? "" : "s"}
            </Text>
          )}
        </View>
        <Pressable
          onPress={selecting ? cancelSelect : () => enterSelect()}
          disabled={archivedPhotos.length === 0}
          hitSlop={12}
          style={styles.headerSide}
        >
          <Text
            style={[
              typography.body,
              {
                color: archivedPhotos.length === 0 ? colors.textTertiary : colors.accent,
                textAlign: "right",
              },
            ]}
          >
            {selecting ? "Done" : "Select"}
          </Text>
        </Pressable>
      </View>

      {archivedPhotos.length === 0 ? (
        <EmptyState
          icon="archive-outline"
          title="Archive is Empty"
          body="Photos you archive will be hidden from your library and appear here."
        />
      ) : (
        <>
          <FlatList
            data={archivedPhotos}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            numColumns={COLS}
            getItemLayout={getItemLayout}
            removeClippedSubviews
            initialNumToRender={18}
            maxToRenderPerBatch={12}
            windowSize={5}
            contentContainerStyle={listPadding}
          />
          <GlassView
            intensity={80}
            bordered
            style={[styles.toolbar, { paddingBottom: Math.max(insets.bottom, 12) }]}
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
                      !hasSelection && styles.btnDisabled,
                      pressed && { opacity: 0.55 },
                    ]}
                  >
                    <Text
                      style={[
                        typography.subhead,
                        {
                          color: hasSelection ? colors.accent : colors.textTertiary,
                        },
                      ]}
                    >
                      Restore{hasSelection ? ` (${selected.size})` : ""}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={hasSelection ? deleteSelected : undefined}
                    disabled={!hasSelection}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.toolbarBtn,
                      !hasSelection && styles.btnDisabled,
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
              <Text
                style={[
                  typography.subhead,
                  { color: colors.textSecondary, textAlign: "center", flex: 1 },
                ]}
              >
                Tap Select to manage archived photos
              </Text>
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
  headerCenter: { flex: 1, alignItems: "center" },
  tile: { overflow: "hidden" },
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
  selectedOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.12)",
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
  toolbarBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  toolbarActions: { flexDirection: "row", gap: 20 },
  btnDisabled: { opacity: 0.35 },
});
