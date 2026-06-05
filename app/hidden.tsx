import { useCallback, useEffect, useRef, useState } from "react";
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

export default function HiddenScreen() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { hiddenPhotos, unhidePhoto, moveToRecentlyDeleted } = usePhotos();
  const { width } = useWindowDimensions();
  const [unlocked, setUnlocked] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const didAttempt = useRef(false);

  const tileSize = width / COLS;

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
          promptMessage: "Access Hidden Photos",
          cancelLabel: "Cancel",
          disableDeviceFallback: false,
        });
        if (result.success) {
          setUnlocked(true);
        } else {
          router.back();
        }
      } catch {
        setUnlocked(true);
      }
    })();
  }, []);

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
    setSelected(new Set(hiddenPhotos.map((p) => p.id)));
  }, [hiddenPhotos]);

  const unhideSelected = useCallback(() => {
    Array.from(selected).forEach((id) => unhidePhoto(id));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSelected(new Set());
    setSelecting(false);
  }, [selected, unhidePhoto]);

  const deleteSelected = useCallback(() => {
    const count = selected.size;
    Alert.alert(
      `Delete ${count} Item${count === 1 ? "" : "s"} Forever?`,
      "These items will be moved to Recently Deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            const toDelete = hiddenPhotos.filter((p) => selected.has(p.id));
            toDelete.forEach((p) => {
              unhidePhoto(p.id);
              moveToRecentlyDeleted(p);
            });
            setSelected(new Set());
            setSelecting(false);
          },
        },
      ],
    );
  }, [selected, hiddenPhotos, unhidePhoto, moveToRecentlyDeleted]);

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
        </Pressable>
      );
    },
    [selecting, selected, tileSize, toggleSelect, enterSelect],
  );

  if (!unlocked) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]} />
    );
  }

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
            Hidden
          </Text>
          {hiddenPhotos.length > 0 && (
            <Text
              style={[
                typography.footnote,
                { color: colors.textSecondary, marginTop: 1 },
              ]}
            >
              {hiddenPhotos.length} item{hiddenPhotos.length === 1 ? "" : "s"}
            </Text>
          )}
        </View>
        <Pressable
          onPress={selecting ? cancelSelect : () => enterSelect()}
          disabled={hiddenPhotos.length === 0}
          hitSlop={12}
          style={styles.headerSide}
        >
          <Text
            style={[
              typography.body,
              {
                color:
                  hiddenPhotos.length === 0
                    ? colors.textTertiary
                    : colors.accent,
                textAlign: "right",
              },
            ]}
          >
            {selecting ? "Done" : "Select"}
          </Text>
        </Pressable>
      </View>

      {hiddenPhotos.length === 0 ? (
        <EmptyState
          icon="eye-off-outline"
          title="No Hidden Photos"
          body="Photos you hide will only appear here, protected by biometrics."
        />
      ) : (
        <>
          <FlatList
            data={hiddenPhotos}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
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
                    onPress={hasSelection ? unhideSelected : undefined}
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
                          color: hasSelection
                            ? colors.accent
                            : colors.textTertiary,
                        },
                      ]}
                    >
                      Unhide{hasSelection ? ` (${selected.size})` : ""}
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
                Tap Select to manage hidden photos
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
