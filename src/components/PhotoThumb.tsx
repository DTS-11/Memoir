import { Image } from 'expo-image';
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

export function PhotoThumb({ photo, size, onPress, radius = 2 }: Props) {
  const { colors } = useTheme();
  const isVideo = photo.mediaType === 'video';

  return (
    <Pressable
      onPress={() => onPress?.(photo)}
      style={{ width: size, height: size, padding: 1 }}
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
          transition={120}
          recyclingKey={photo.id}
          cachePolicy="memory-disk"
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

const styles = StyleSheet.create({
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
