import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-worklets';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePhotos, type Photo } from '../../src/hooks/usePhotos';
import { useTheme } from '../../src/theme/ThemeProvider';
import { PhotoGrid } from '../../src/components/PhotoGrid';
import { SegmentedControl } from '../../src/components/SegmentedControl';
import { TopGlassBar } from '../../src/components/TopGlassBar';
import { EmptyState } from '../../src/components/EmptyState';
import { nextZoom, prevZoom, type ZoomLevel } from '../../src/utils/grouping';

const zoomOptions: { value: ZoomLevel; label: string }[] = [
  { value: 'years', label: 'Years' },
  { value: 'months', label: 'Months' },
  { value: 'days', label: 'Days' },
  { value: 'all', label: 'All Photos' },
];

export default function Library() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { permission, photos, totalCount, requestPermission, loadMore } = usePhotos();
  const [zoom, setZoom] = useState<ZoomLevel>('days');

  const changeZoom = useCallback((z: ZoomLevel) => {
    setZoom((prev) => {
      if (prev !== z) Haptics.selectionAsync();
      return z;
    });
  }, []);

  const onZoomIn = useCallback(() => changeZoom(nextZoom(zoom)), [changeZoom, zoom]);
  const onZoomOut = useCallback(() => changeZoom(prevZoom(zoom)), [changeZoom, zoom]);

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onEnd((e) => {
          if (e.scale > 1.25) runOnJS(onZoomIn)();
          else if (e.scale < 0.8) runOnJS(onZoomOut)();
        }),
    [onZoomIn, onZoomOut]
  );

  const onPressPhoto = useCallback((p: Photo) => {
    router.push({ pathname: '/photo/[id]', params: { id: p.id } });
  }, []);

  useEffect(() => {
    if (permission === 'undetermined') {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const headerHeight = insets.top + 60 + 44 + 18;
  const dockClearance = insets.bottom + 90;

  if (permission === 'denied' || permission === 'undetermined') {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <TopGlassBar title="Library" />
        <EmptyState
          icon="lock-closed-outline"
          title="No access to photos"
          body="Memoir builds your gallery from your device's library. Grant photo access to continue."
          actionLabel="Allow Photo Access"
          onAction={() => router.push('/permission')}
        />
      </View>
    );
  }

  if (photos.length === 0) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <TopGlassBar title="Library" />
        <EmptyState
          icon="images-outline"
          title="No photos yet"
          body="When you add photos to this device, they'll appear here."
        />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <GestureDetector gesture={pinch}>
        <View style={styles.fill}>
          <PhotoGrid
            photos={photos}
            zoom={zoom}
            onPressPhoto={onPressPhoto}
            onEndReached={loadMore}
            contentTopPadding={headerHeight}
            contentBottomPadding={dockClearance}
          />
        </View>
      </GestureDetector>

      <View style={styles.topBlock} pointerEvents="box-none">
        <TopGlassBar
          title="Library"
          subtitle={`${totalCount.toLocaleString()} item${totalCount === 1 ? '' : 's'}`}
          right={
            <Pressable hitSlop={10} style={styles.iconBtn}>
              <Ionicons name="ellipsis-horizontal-circle" size={28} color={colors.accent} />
            </Pressable>
          }
        />
        <View style={[styles.segmentWrap, { backgroundColor: colors.background }]}>
          <SegmentedControl options={zoomOptions} value={zoom} onChange={changeZoom} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBlock: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  segmentWrap: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  iconBtn: {
    paddingBottom: 2,
  },
});
