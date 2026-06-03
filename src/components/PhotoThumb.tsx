import { Image } from 'expo-image';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View, Text } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import type { Photo } from '../hooks/usePhotos';

type Props = {
  photo: Photo;
  size: number;
  onPress?: (photo: Photo) => void;
  radius?: number;
};

function formatDuration(seconds: number) {
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function PhotoThumbImpl({ photo, size, onPress, radius = 2 }: Props) {
  const { colors } = useTheme();
  const isVideo = photo.mediaType === 'video';

  // Stable per-instance handler — only depends on photo identity + parent callback.
  const handlePress = useCallback(() => onPress?.(photo), [onPress, photo]);

  return (
    <Pressable
      onPress={handlePress}
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
          transition={80}
          recyclingKey={photo.id}
          cachePolicy="memory-disk"
          priority="normal"
          allowDownscaling
        />
        {isVideo && (
          <View style={styles.videoBadge}>
            <Text style={styles.videoText}>{formatDuration(photo.duration)}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

/**
 * Re-render only when the photo identity or tile size changes. The parent grid
 * re-renders frequently (scroll, zoom transitions) but the underlying photo
 * data is immutable, so this trims an enormous amount of work.
 */
export const PhotoThumb = memo(PhotoThumbImpl, (prev, next) => {
  return (
    prev.photo.id === next.photo.id &&
    prev.size === next.size &&
    prev.radius === next.radius &&
    prev.onPress === next.onPress
  );
});

const styles = StyleSheet.create({
  pressable: { padding: 1 },
  tile: {
    flex: 1,
    overflow: 'hidden',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 4,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  videoText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
  },
});
