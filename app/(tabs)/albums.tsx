import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeProvider';
import { TopGlassBar } from '../../src/components/TopGlassBar';
import { EmptyState } from '../../src/components/EmptyState';
import { useAlbums, type AlbumPreview } from '../../src/hooks/useAlbums';
import { usePhotos } from '../../src/hooks/usePhotos';
import { router } from 'expo-router';

export default function AlbumsScreen() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { permission } = usePhotos();
  const enabled = permission === 'granted' || permission === 'limited';
  const { albums, smart, loading } = useAlbums(enabled);
  const { width } = useWindowDimensions();

  const cardW = (width - 16 * 2 - 12) / 2;

  if (!enabled) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <TopGlassBar title="Albums" />
        <EmptyState
          icon="albums-outline"
          title="Albums will appear here"
          body="Grant photo access to view your albums."
          actionLabel="Allow Photo Access"
          onAction={() => router.push('/permission')}
        />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingTop: insets.top + 80,
          paddingBottom: insets.bottom + 110,
          paddingHorizontal: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[typography.title2, { color: colors.text, marginBottom: 12 }]}>
          My Albums
        </Text>
        <View style={styles.grid}>
          {albums.map((a) => (
            <AlbumCard key={a.id} album={a} width={cardW} />
          ))}
          {albums.length === 0 && !loading && (
            <Text style={[typography.subhead, { color: colors.textSecondary, marginVertical: 16 }]}>
              No user albums yet.
            </Text>
          )}
        </View>

        <Text style={[typography.title2, { color: colors.text, marginTop: 24, marginBottom: 12 }]}>
          Media Types
        </Text>
        <View style={[styles.list, { backgroundColor: colors.surfaceElevated }]}>
          {smart.map((s, i) => (
            <SmartRow key={s.id} album={s} divider={i < smart.length - 1} />
          ))}
        </View>
      </ScrollView>
      <TopGlassBar title="Albums" />
    </View>
  );
}

function AlbumCard({ album, width }: { album: AlbumPreview; width: number }) {
  const { colors, typography } = useTheme();
  return (
    <Pressable style={{ width, marginBottom: 18 }}>
      <View
        style={[
          styles.cover,
          { width, height: width, backgroundColor: colors.thumbPlaceholder },
        ]}
      >
        {album.coverUri ? (
          <Image source={{ uri: album.coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[styles.coverFallback, { backgroundColor: colors.surface }]}>
            <Ionicons name="images" size={28} color={colors.textTertiary} />
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={[typography.subhead, { color: colors.text, marginTop: 8 }]}>
        {album.title}
      </Text>
      <Text style={[typography.footnote, { color: colors.textSecondary }]}>
        {album.count.toLocaleString()}
      </Text>
    </Pressable>
  );
}

function SmartRow({ album, divider }: { album: AlbumPreview; divider: boolean }) {
  const { colors, typography } = useTheme();
  return (
    <Pressable style={[styles.row, divider && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[styles.rowThumb, { backgroundColor: colors.thumbPlaceholder }]}>
        {album.coverUri ? (
          <Image source={{ uri: album.coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : null}
      </View>
      <Text style={[typography.body, { color: colors.text, flex: 1 }]} numberOfLines={1}>
        {album.title}
      </Text>
      <Text style={[typography.subhead, { color: colors.textSecondary }]}>
        {album.count.toLocaleString()}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  cover: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  coverFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  rowThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: 'hidden',
  },
});
