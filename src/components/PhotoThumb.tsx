import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback } from "react";
import { Pressable, StyleSheet, View, Text } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import type { Photo } from "../hooks/usePhotos";

type Props = {
  photo: Photo;
  size: number;
  onPress?: (photo: Photo) => void;
  onLongPress?: (photo: Photo) => void;
  radius?: number;
  selected?: boolean;
  inSelectMode?: boolean;
  isFavorite?: boolean;
};

function formatDuration(seconds: number) {
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function PhotoThumbImpl({
  photo,
  size,
  onPress,
  onLongPress,
  radius = 2,
  selected = false,
  inSelectMode = false,
  isFavorite = false,
}: Props) {
  const { colors } = useTheme();
  const isVideo = photo.mediaType === "video";
  const isAudio = photo.mediaType === "audio";
  const hasVisual = photo.mediaType === "photo" || photo.mediaType === "video";

  const handlePress = useCallback(() => onPress?.(photo), [onPress, photo]);
  const handleLongPress = useCallback(() => onLongPress?.(photo), [onLongPress, photo]);

  const iconSize = Math.round(size * 0.34);

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={350}
      style={[styles.pressable, { width: size, height: size }]}
    >
      <View
        style={[
          styles.tile,
          { borderRadius: radius, backgroundColor: colors.thumbPlaceholder },
        ]}
      >
        {hasVisual ? (
          <Image
            source={{ uri: photo.uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={0}
            recyclingKey={photo.id}
            cachePolicy="memory-disk"
            priority="low"
            allowDownscaling
          />
        ) : isAudio ? (
          <View style={[styles.mediaPlaceholder, styles.audioBg]}>
            <Ionicons
              name="musical-notes"
              size={iconSize}
              color="rgba(255,255,255,0.45)"
            />
          </View>
        ) : (
          <>
            <Image
              source={{ uri: photo.uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={0}
              recyclingKey={photo.id}
              cachePolicy="memory-disk"
              priority="low"
            />
            <View style={styles.unknownBadge} pointerEvents="none">
              <Ionicons
                name="document-outline"
                size={iconSize * 0.6}
                color="rgba(255,255,255,0.55)"
              />
            </View>
          </>
        )}

        {selected && <View style={styles.selectedDim} />}
        {selected && <View style={[styles.selectionRing, { borderRadius: radius }]} />}

        {(isVideo || isAudio) && photo.duration > 0 && (
          <View style={styles.durationBadge}>
            {isVideo && (
              <Ionicons name="play" size={9} color="#FFF" style={{ marginRight: 2 }} />
            )}
            {isAudio && (
              <Ionicons
                name="musical-note"
                size={9}
                color="#FFF"
                style={{ marginRight: 2 }}
              />
            )}
            <Text style={styles.durationText}>{formatDuration(photo.duration)}</Text>
          </View>
        )}

        {isFavorite && !inSelectMode && (
          <View style={styles.favBadge}>
            <Ionicons name="heart" size={11} color="#FFF" />
          </View>
        )}

        {inSelectMode && (
          <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
            {selected && <Ionicons name="checkmark" size={12} color="#000" />}
          </View>
        )}
      </View>
    </Pressable>
  );
}

export const PhotoThumb = memo(PhotoThumbImpl, (prev, next) => {
  return (
    prev.photo.id === next.photo.id &&
    prev.size === next.size &&
    prev.radius === next.radius &&
    prev.onPress === next.onPress &&
    prev.onLongPress === next.onLongPress &&
    prev.selected === next.selected &&
    prev.inSelectMode === next.inSelectMode &&
    prev.isFavorite === next.isFavorite
  );
});

const styles = StyleSheet.create({
  pressable: { padding: 1 },
  tile: { flex: 1, overflow: "hidden" },

  mediaPlaceholder: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  audioBg: { backgroundColor: "#111" },
  unknownBadge: {
    position: "absolute",
    bottom: 4,
    right: 5,
  },

  selectionRing: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2.5,
    borderColor: "rgba(255,255,255,0.95)",
  },
  selectedDim: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.22)",
  },

  durationBadge: {
    position: "absolute",
    bottom: 4,
    right: 6,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.50)",
  },
  durationText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "600",
  },

  favBadge: {
    position: "absolute",
    bottom: 5,
    left: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.38)",
    alignItems: "center",
    justifyContent: "center",
  },

  checkCircle: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.90)",
    backgroundColor: "rgba(0,0,0,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleSelected: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderColor: "rgba(255,255,255,0.96)",
  },
});
