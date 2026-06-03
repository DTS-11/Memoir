import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { GlassView } from '../../src/components/GlassView';
import { useTheme } from '../../src/theme/ThemeProvider';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type AssetState = {
  uri: string;
  width: number;
  height: number;
  creationTime: number;
  mediaType: MediaLibrary.MediaTypeValue;
  filename: string;
} | null;

export default function PhotoViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors, typography } = useTheme();
  const [asset, setAsset] = useState<AssetState>(null);
  const [chromeVisible, setChromeVisible] = useState(true);

  const scale = useSharedValue(1);
  const baseScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const baseTx = useSharedValue(0);
  const baseTy = useSharedValue(0);
  const chromeOpacity = useSharedValue(1);
  const overlayOpacity = useSharedValue(1);

  useEffect(() => {
    if (!id) return;
    MediaLibrary.getAssetInfoAsync(id).then((info) => {
      if (!info) return;
      setAsset({
        uri: info.localUri || info.uri,
        width: info.width,
        height: info.height,
        creationTime: info.creationTime,
        mediaType: info.mediaType,
        filename: info.filename,
      });
    }).catch(() => {});
  }, [id]);

  const setChrome = useCallback((v: boolean) => {
    setChromeVisible(v);
    chromeOpacity.value = withTiming(v ? 1 : 0, { duration: 180 });
  }, [chromeOpacity]);

  const goBack = useCallback(() => router.back(), []);

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(1)
        .onEnd(() => {
          runOnJS(setChrome)(!chromeVisible);
        }),
    [chromeVisible, setChrome]
  );

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .onEnd((e) => {
          if (scale.value > 1.05) {
            scale.value = withSpring(1, { damping: 18 });
            tx.value = withSpring(0);
            ty.value = withSpring(0);
            baseScale.value = 1;
            baseTx.value = 0;
            baseTy.value = 0;
          } else {
            scale.value = withSpring(2.5, { damping: 18 });
            baseScale.value = 2.5;
          }
        }),
    [baseScale, baseTx, baseTy, scale, tx, ty]
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onUpdate((e) => {
          scale.value = Math.max(0.7, baseScale.value * e.scale);
        })
        .onEnd(() => {
          if (scale.value < 1) {
            scale.value = withSpring(1);
            baseScale.value = 1;
            tx.value = withSpring(0);
            ty.value = withSpring(0);
            baseTx.value = 0;
            baseTy.value = 0;
          } else if (scale.value > 5) {
            scale.value = withSpring(5);
            baseScale.value = 5;
          } else {
            baseScale.value = scale.value;
          }
        }),
    [baseScale, baseTx, baseTy, scale, tx, ty]
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(1)
        .maxPointers(2)
        .onUpdate((e) => {
          if (scale.value > 1.02) {
            tx.value = baseTx.value + e.translationX;
            ty.value = baseTy.value + e.translationY;
          } else {
            ty.value = e.translationY;
            const progress = Math.min(1, Math.abs(e.translationY) / 300);
            overlayOpacity.value = 1 - progress * 0.6;
            scale.value = 1 - progress * 0.1;
          }
        })
        .onEnd((e) => {
          if (scale.value > 1.02) {
            baseTx.value = tx.value;
            baseTy.value = ty.value;
          } else if (Math.abs(e.translationY) > 120 || Math.abs(e.velocityY) > 800) {
            overlayOpacity.value = withTiming(0, { duration: 180 });
            ty.value = withTiming(e.translationY > 0 ? SCREEN_H : -SCREEN_H, { duration: 220 });
            runOnJS(goBack)();
          } else {
            ty.value = withSpring(0);
            tx.value = withSpring(0);
            scale.value = withSpring(1);
            overlayOpacity.value = withTiming(1);
          }
        }),
    [baseTx, baseTy, goBack, overlayOpacity, scale, tx, ty]
  );

  const composed = useMemo(
    () => Gesture.Simultaneous(Gesture.Exclusive(doubleTap, tap), pinch, pan),
    [doubleTap, tap, pinch, pan]
  );

  const imgStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  const chromeStyle = useAnimatedStyle(() => ({ opacity: chromeOpacity.value }));
  const bgStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  const aspectFit = useMemo(() => {
    if (!asset) return { width: SCREEN_W, height: SCREEN_W };
    const ratio = asset.width / asset.height;
    const screenRatio = SCREEN_W / SCREEN_H;
    if (ratio > screenRatio) {
      return { width: SCREEN_W, height: SCREEN_W / ratio };
    }
    return { width: SCREEN_H * ratio, height: SCREEN_H };
  }, [asset]);

  const isVideo = asset?.mediaType === 'video';
  const dateStr = asset
    ? new Date(asset.creationTime).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, bgStyle]} />

      <GestureDetector gesture={composed}>
        <View style={styles.fill}>
          {asset && (
            <Animated.View style={[styles.imgWrap, imgStyle]}>
              <Image
                source={{ uri: asset.uri }}
                style={aspectFit}
                contentFit="contain"
                transition={150}
                cachePolicy="memory-disk"
              />
              {isVideo && (
                <View style={styles.playBadge}>
                  <Ionicons name="play-circle" size={64} color="rgba(255,255,255,0.9)" />
                </View>
              )}
            </Animated.View>
          )}
        </View>
      </GestureDetector>

      <Animated.View
        pointerEvents={chromeVisible ? 'box-none' : 'none'}
        style={[styles.topChrome, chromeStyle]}
      >
        <GlassView intensity={70} style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={28} color="#FFF" />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.titleText} numberOfLines={1}>
              {asset
                ? new Date(asset.creationTime).toLocaleDateString(undefined, {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : ''}
            </Text>
            <Text style={styles.titleSub}>
              {asset
                ? new Date(asset.creationTime).toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : ''}
            </Text>
          </View>
          <Pressable
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            hitSlop={12}
            style={styles.backBtn}
          >
            <Ionicons name="ellipsis-horizontal-circle" size={28} color="#FFF" />
          </Pressable>
        </GlassView>
      </Animated.View>

      <Animated.View
        pointerEvents={chromeVisible ? 'box-none' : 'none'}
        style={[styles.bottomChrome, chromeStyle]}
      >
        <GlassView
          intensity={70}
          style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}
        >
          <Text style={styles.metaText} numberOfLines={1}>
            {dateStr}
          </Text>
          <View style={styles.actions}>
            <ActionBtn icon="share-outline" />
            <ActionBtn icon="heart-outline" />
            <ActionBtn icon="information-circle-outline" />
            <ActionBtn icon="trash-outline" />
          </View>
        </GlassView>
      </Animated.View>
    </View>
  );
}

function ActionBtn({ icon }: { icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable
      hitSlop={10}
      onPress={() => Haptics.selectionAsync()}
      style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.5 }]}
    >
      <Ionicons name={icon} size={26} color="#FFF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imgWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadge: {
    position: 'absolute',
    pointerEvents: 'none',
  },
  topChrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 6,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  titleText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  titleSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 1,
  },
  bottomChrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  bottomBar: {
    paddingHorizontal: 18,
    paddingTop: 14,
    gap: 12,
  },
  metaText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  actionBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
