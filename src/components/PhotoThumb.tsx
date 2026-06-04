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

  const handlePress = useCallback(() => onPress?.(photo), [onPress, photo]);
  const handleLongPress = useCallback(
    () => onLongPress?.(photo),
    [onLongPress, photo],
  );

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

        {/* Dim overlay when selected */}
        {selected && <View style={styles.selectedDim} />}

        {/* Selection ring — drawn as an overlay so it never affects image layout */}
        {selected && (
          <View style={[styles.selectionRing, { borderRadius: radius }]} />
        )}

        {isVideo && (
          <View style={styles.videoBadge}>
            <Text style={styles.videoText}>
              {formatDuration(photo.duration)}
            </Text>
          </View>
        )}

        {isFavorite && !inSelectMode && (
          <View style={styles.favBadge}>
            <Ionicons name="heart" size={11} color="#FFF" />
          </View>
        )}

        {inSelectMode && (
          <View
            style={[styles.checkCircle, selected && styles.checkCircleSelected]}
          >
            {selected && <Ionicons name="checkmark" size={12} color="#FFF" />}
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
  tile: {
    flex: 1,
    overflow: "hidden",
  },
  // Drawn on top of the image as an absoluteFill overlay — never modifies tile
  // layout so it can't clip or hide the image beneath it.
  selectionRing: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderColor: "#007AFF",
  },
  selectedDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  videoBadge: {
    position: "absolute",
    bottom: 4,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  videoText: {
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
    backgroundColor: "rgba(0,0,0,0.35)",
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
    borderColor: "rgba(255,255,255,0.9)",
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleSelected: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
});
