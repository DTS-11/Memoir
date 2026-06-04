import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as MediaLibrary from "expo-media-library/legacy";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { GlassView } from "../../src/components/GlassView";
import { usePhotos, type Photo } from "../../src/hooks/usePhotos";
import { VideoView, useVideoPlayer } from "expo-video";
import { useEvent } from "expo";

type AssetDetails = Photo & {
  localUri?: string | null;
};

export default function PhotoViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const {
    photos,
    moveToRecentlyDeleted,
    toggleFavorite,
    favoriteIds,
    archivePhoto,
  } = usePhotos();
  const listRef = useRef<FlatList<Photo>>(null);

  const fallbackPhoto = useMemo(
    () => photos.find((p) => p.id === id),
    [id, photos],
  );
  const [directPhoto, setDirectPhoto] = useState<Photo | null>(null);
  const data =
    photos.length > 0
      ? photos
      : fallbackPhoto
        ? [fallbackPhoto]
        : directPhoto
          ? [directPhoto]
          : [];
  const initialIndex = Math.max(
    0,
    data.findIndex((p) => p.id === id),
  );
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [details, setDetails] = useState<AssetDetails | null>(
    fallbackPhoto ?? null,
  );
  const [chromeVisible, setChromeVisible] = useState(true);
  const [infoVisible, setInfoVisible] = useState(false);

  const scale = useSharedValue(1);
  const baseScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const baseTx = useSharedValue(0);
  const baseTy = useSharedValue(0);
  const chromeOpacity = useSharedValue(1);
  const overlayOpacity = useSharedValue(1);

  const videoPlayer = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.25;
  });
  const { isPlaying: videoPlaying } = useEvent(videoPlayer, "playingChange", {
    isPlaying: videoPlayer.playing,
  });
  const { currentTime: videoCurrentTime } = useEvent(
    videoPlayer,
    "timeUpdate",
    {
      currentTime: 0,
      bufferedPosition: 0,
      currentLiveTimestamp: null,
      currentOffsetFromLive: null,
    },
  );
  const { status: videoStatus } = useEvent(videoPlayer, "statusChange", {
    status: videoPlayer.status,
    error: undefined,
  });

  const current = data[currentIndex] ?? fallbackPhoto ?? directPhoto;
  const displayUri = details?.localUri || current?.uri;
  const isCurrentVideo = current?.mediaType === "video";

  const [videoDuration, setVideoDuration] = useState(0);
  useEffect(() => {
    const d = videoPlayer.duration;
    if (d > 0) setVideoDuration(d);
  }, [videoStatus, videoCurrentTime, videoPlayer]);

  const resetZoom = useCallback(() => {
    scale.value = withTiming(1, { duration: 140 });
    tx.value = withTiming(0, { duration: 140 });
    ty.value = withTiming(0, { duration: 140 });
    baseScale.value = 1;
    baseTx.value = 0;
    baseTy.value = 0;
  }, [baseScale, baseTx, baseTy, scale, tx, ty]);

  useEffect(() => {
    if (data.length === 0) return;
    const index = Math.max(
      0,
      data.findIndex((p) => p.id === id),
    );
    setCurrentIndex(index);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index, animated: false });
    });
  }, [data.length, id]);

  useEffect(() => {
    if (data.length > 0 || !id) return;
    MediaLibrary.getAssetInfoAsync(id)
      .then((info) => {
        if (!info) return;
        const next = {
          id: info.id,
          uri: info.uri,
          width: info.width,
          height: info.height,
          creationTime: info.creationTime,
          duration: info.duration,
          mediaType: info.mediaType,
          filename: info.filename,
        };
        setDirectPhoto(next);
        setDetails({ ...next, localUri: info.localUri });
      })
      .catch(() => {});
  }, [data.length, id]);

  useEffect(() => {
    if (!current?.id) return;
    resetZoom();
    setInfoVisible(false);
    MediaLibrary.getAssetInfoAsync(current.id)
      .then((info) => {
        if (!info) return;
        setDetails({
          id: info.id,
          uri: info.uri,
          localUri: info.localUri,
          width: info.width,
          height: info.height,
          creationTime: info.creationTime,
          duration: info.duration,
          mediaType: info.mediaType,
          filename: info.filename,
        });
      })
      .catch(() => setDetails(current));
  }, [current, resetZoom]);

  useEffect(() => {
    if (current?.mediaType === "video" && current.uri) {
      setVideoDuration(0);
      videoPlayer.replace(current.uri);
      videoPlayer.play();
    } else {
      videoPlayer.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.mediaType]);

  const toggleVideoPlayback = useCallback(() => {
    if (videoPlaying) {
      videoPlayer.pause();
    } else {
      videoPlayer.play();
    }
    Haptics.selectionAsync();
  }, [videoPlaying, videoPlayer]);

  const seekVideo = useCallback(
    (t: number) => {
      videoPlayer.currentTime = t;
    },
    [videoPlayer],
  );

  const setChrome = useCallback(
    (v: boolean) => {
      setChromeVisible(v);
      chromeOpacity.value = withTiming(v ? 1 : 0, { duration: 150 });
    },
    [chromeOpacity],
  );

  const goBack = useCallback(() => {
    videoPlayer.pause();
    router.back();
  }, [videoPlayer]);

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(1)
        .onEnd(() => {
          runOnJS(setChrome)(!chromeVisible);
        }),
    [chromeVisible, setChrome],
  );

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
          const next = scale.value > 1.05 ? 1 : 2.5;
          scale.value = withTiming(next, { duration: 180 });
          tx.value = withTiming(0, { duration: 180 });
          ty.value = withTiming(0, { duration: 180 });
          baseScale.value = next;
          baseTx.value = 0;
          baseTy.value = 0;
        }),
    [baseScale, baseTx, baseTy, scale, tx, ty],
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onUpdate((e) => {
          scale.value = Math.max(1, Math.min(5, baseScale.value * e.scale));
        })
        .onEnd(() => {
          baseScale.value = scale.value;
          if (scale.value <= 1.01) {
            scale.value = withTiming(1, { duration: 140 });
            tx.value = withTiming(0, { duration: 140 });
            ty.value = withTiming(0, { duration: 140 });
            baseScale.value = 1;
            baseTx.value = 0;
            baseTy.value = 0;
          }
        }),
    [baseScale, baseTx, baseTy, scale, tx, ty],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-12, 12])
        .failOffsetX([-18, 18])
        .onUpdate((e) => {
          if (scale.value > 1.02) {
            tx.value = baseTx.value + e.translationX;
            ty.value = baseTy.value + e.translationY;
          } else {
            ty.value = e.translationY;
            const progress = Math.min(1, Math.abs(e.translationY) / 320);
            overlayOpacity.value = 1 - progress * 0.55;
            scale.value = 1 - progress * 0.08;
          }
        })
        .onEnd((e) => {
          if (scale.value > 1.02) {
            baseTx.value = tx.value;
            baseTy.value = ty.value;
          } else if (
            Math.abs(e.translationY) > 130 ||
            Math.abs(e.velocityY) > 900
          ) {
            overlayOpacity.value = withTiming(0, { duration: 160 });
            ty.value = withTiming(e.translationY > 0 ? height : -height, {
              duration: 190,
            });
            runOnJS(goBack)();
          } else {
            tx.value = withTiming(0, { duration: 140 });
            ty.value = withTiming(0, { duration: 140 });
            scale.value = withTiming(1, { duration: 140 });
            overlayOpacity.value = withTiming(1, { duration: 140 });
          }
        }),
    [baseTx, baseTy, goBack, height, overlayOpacity, scale, tx, ty],
  );

  const composed = useMemo(
    () => Gesture.Simultaneous(Gesture.Exclusive(doubleTap, tap), pinch, pan),
    [doubleTap, tap, pinch, pan],
  );

  const imgStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  const chromeStyle = useAnimatedStyle(() => ({
    opacity: chromeOpacity.value,
  }));
  const bgStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / width);
      setCurrentIndex(Math.max(0, Math.min(index, data.length - 1)));
    },
    [data.length, width],
  );

  const shareCurrent = useCallback(async () => {
    if (!current) return;
    Haptics.selectionAsync();
    const uri = details?.localUri ?? displayUri;
    if (!uri) return;
    await Share.share({ url: uri });
  }, [current, details, displayUri]);

  const handleToggleFavorite = useCallback(() => {
    if (!current) return;
    Haptics.selectionAsync();
    toggleFavorite(current.id);
  }, [current, toggleFavorite]);

  const handleArchive = useCallback(() => {
    if (!current) return;
    Alert.alert(
      "Archive Photo?",
      "This will be hidden from your library but accessible in Albums → Archive.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          onPress: () => {
            archivePhoto(current.id);
            router.back();
          },
        },
      ],
    );
  }, [current, archivePhoto]);

  const deleteCurrent = useCallback(() => {
    if (!current) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      "Delete Photo?",
      "The item will be moved to Recently Deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            moveToRecentlyDeleted(current);
            router.back();
          },
        },
      ],
    );
  }, [current, moveToRecentlyDeleted]);

  const dateTitle = current
    ? new Date(current.creationTime).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";
  const timeTitle = current
    ? new Date(current.creationTime).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
  const isFavorite = current ? favoriteIds.has(current.id) : false;

  return (
    <View style={styles.root}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }, bgStyle]}
      />

      <GestureDetector gesture={composed}>
        <View style={styles.fill}>
          <FlatList
            ref={listRef}
            data={data}
            horizontal
            pagingEnabled
            initialScrollIndex={initialIndex}
            getItemLayout={(_, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => {
              const isCurrentItem = index === currentIndex;
              const isActiveVideo = isCurrentItem && item.mediaType === "video";
              return (
                <View style={[styles.page, { width, height }]}>
                  <Animated.View style={isCurrentItem ? imgStyle : undefined}>
                    {isActiveVideo ? (
                      <VideoView
                        player={videoPlayer}
                        style={{ width, height }}
                        contentFit="contain"
                        nativeControls={false}
                        allowsPictureInPicture={false}
                      />
                    ) : (
                      <Image
                        source={{
                          uri:
                            isCurrentItem && displayUri ? displayUri : item.uri,
                        }}
                        style={{ width, height }}
                        contentFit="contain"
                        transition={0}
                        cachePolicy="memory-disk"
                        recyclingKey={item.id}
                        priority={isCurrentItem ? "high" : "normal"}
                        allowDownscaling
                      />
                    )}
                  </Animated.View>
                  {item.mediaType === "video" && !isActiveVideo && (
                    <View style={styles.playBadge} pointerEvents="none">
                      <Ionicons
                        name="play-circle"
                        size={64}
                        color="rgba(255,255,255,0.9)"
                      />
                    </View>
                  )}
                </View>
              );
            }}
            onMomentumScrollEnd={onMomentumEnd}
            showsHorizontalScrollIndicator={false}
            windowSize={3}
            maxToRenderPerBatch={2}
            initialNumToRender={1}
            removeClippedSubviews
          />
        </View>
      </GestureDetector>

      <Animated.View
        pointerEvents={chromeVisible ? "box-none" : "none"}
        style={[styles.topChrome, chromeStyle]}
      >
        <GlassView
          interactive
          intensity={72}
          style={[styles.topBar, { paddingTop: insets.top + 8 }]}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.iconBtn}
          >
            <Ionicons name="chevron-back" size={28} color="#FFF" />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.titleText} numberOfLines={1}>
              {dateTitle}
            </Text>
            <Text style={styles.titleSub} numberOfLines={1}>
              {timeTitle}
            </Text>
          </View>
          <Pressable
            onPress={() => setInfoVisible((v) => !v)}
            hitSlop={12}
            style={styles.iconBtn}
          >
            <Ionicons
              name="ellipsis-horizontal-circle"
              size={28}
              color="#FFF"
            />
          </Pressable>
        </GlassView>
      </Animated.View>

      <Animated.View
        pointerEvents={chromeVisible ? "box-none" : "none"}
        style={[styles.bottomChrome, chromeStyle]}
      >
        {infoVisible && current && (
          <GlassView intensity={72} style={styles.infoPanel}>
            <InfoRow
              label="File"
              value={details?.filename || current.filename}
            />
            <InfoRow
              label="Size"
              value={`${details?.width || current.width} x ${details?.height || current.height}`}
            />
            <InfoRow
              label="Type"
              value={current.mediaType === "video" ? "Video" : "Photo"}
            />
          </GlassView>
        )}
        {isCurrentVideo && (
          <GlassView intensity={72} style={styles.videoControls}>
            <Pressable
              onPress={toggleVideoPlayback}
              hitSlop={12}
              style={styles.videoPlayBtn}
            >
              <Ionicons
                name={videoPlaying ? "pause" : "play"}
                size={26}
                color="#FFF"
              />
            </Pressable>
            <VideoScrubber
              currentTime={videoCurrentTime}
              duration={videoDuration}
              onSeek={seekVideo}
            />
            <Text style={styles.videoTimeText}>
              {formatTime(videoCurrentTime)} / {formatTime(videoDuration)}
            </Text>
          </GlassView>
        )}
        <GlassView
          interactive
          intensity={72}
          style={[
            styles.bottomBar,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <ActionBtn
            icon="share-outline"
            label="Share"
            onPress={shareCurrent}
          />
          <ActionBtn
            icon={isFavorite ? "heart" : "heart-outline"}
            label="Favorite"
            onPress={handleToggleFavorite}
            active={isFavorite}
          />
          <ActionBtn
            icon="archive-outline"
            label="Archive"
            onPress={handleArchive}
          />
          <ActionBtn
            icon="trash-outline"
            label="Delete"
            onPress={deleteCurrent}
            destructive
          />
        </GlassView>
      </Animated.View>
    </View>
  );
}

function ActionBtn({
  icon,
  label,
  onPress,
  active,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  destructive?: boolean;
}) {
  const color = destructive ? "#FF453A" : active ? "#FF375F" : "#FFF";
  return (
    <Pressable
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.55 }]}
    >
      <Ionicons name={icon} size={25} color={color} />
      <Text style={[styles.actionLabel, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  fill: { flex: 1 },
  page: {
    alignItems: "center",
    justifyContent: "center",
  },
  playBadge: {
    position: "absolute",
    alignSelf: "center",
    top: "46%",
    pointerEvents: "none",
  },
  topChrome: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 6,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: {
    flex: 1,
    alignItems: "center",
  },
  titleText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
  titleSub: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    marginTop: 1,
  },
  bottomChrome: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: 10,
    paddingHorizontal: 12,
  },
  bottomBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 10,
    borderRadius: 28,
    borderCurve: "continuous",
  },
  actionBtn: {
    width: 72,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  actionLabel: {
    fontSize: 10.5,
    fontWeight: "600",
  },
  infoPanel: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 520,
    borderRadius: 22,
    borderCurve: "continuous",
    padding: 14,
    gap: 8,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  infoLabel: {
    width: 54,
    color: "rgba(255,255,255,0.58)",
    fontSize: 12,
    fontWeight: "700",
  },
  infoValue: {
    flex: 1,
    color: "#FFF",
    fontSize: 13,
    fontWeight: "600",
  },
  videoControls: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
    borderCurve: "continuous",
    gap: 12,
  },
  videoPlayBtn: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  videoTimeText: {
    color: "rgba(255,255,255,0.80)",
    fontSize: 12,
    fontWeight: "600",
    minWidth: 76,
    textAlign: "right",
  },
});

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function VideoScrubber({
  currentTime,
  duration,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  onSeek: (t: number) => void;
}) {
  const barWidth = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const thumbX = useSharedValue(0);
  const thumbScale = useSharedValue(1);
  const durationSV = useSharedValue(duration);

  useEffect(() => {
    durationSV.value = duration;
  }, [duration, durationSV]);

  useEffect(() => {
    if (!isDragging.value && barWidth.value > 0 && duration > 0) {
      thumbX.value =
        (Math.min(currentTime, duration) / duration) * barWidth.value;
    }
  }, [currentTime, duration, barWidth, isDragging, thumbX]);

  const handleSeek = useCallback(
    (x: number) => {
      const d = durationSV.value;
      const w = barWidth.value;
      if (d > 0 && w > 0) onSeek((x / w) * d);
    },
    [onSeek, durationSV, barWidth],
  );

  const pan = Gesture.Pan()
    .minDistance(0)
    .onStart(() => {
      isDragging.value = true;
      thumbScale.value = withSpring(1.5, { damping: 20, stiffness: 400 });
    })
    .onUpdate((e) => {
      thumbX.value = Math.max(0, Math.min(barWidth.value, e.x));
    })
    .onEnd(() => {
      isDragging.value = false;
      thumbScale.value = withSpring(1, { damping: 20, stiffness: 400 });
      runOnJS(handleSeek)(thumbX.value);
    });

  const fillStyle = useAnimatedStyle(() => ({
    width: thumbX.value,
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: thumbX.value - 6.5 },
      { scale: thumbScale.value },
    ],
  }));

  return (
    <View
      style={scrubStyles.track}
      onLayout={(e) => {
        barWidth.value = e.nativeEvent.layout.width;
      }}
    >
      <GestureDetector gesture={pan}>
        <View style={scrubStyles.hitArea}>
          <View style={scrubStyles.rail} />
          <Animated.View style={[scrubStyles.fill, fillStyle]} />
          <Animated.View style={[scrubStyles.thumb, thumbStyle]} />
        </View>
      </GestureDetector>
    </View>
  );
}

const scrubStyles = StyleSheet.create({
  track: {
    flex: 1,
    justifyContent: "center",
  },
  hitArea: {
    height: 28,
    justifyContent: "center",
  },
  rail: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.30)",
  },
  fill: {
    position: "absolute",
    left: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#FFF",
  },
  thumb: {
    position: "absolute",
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: "#FFF",
    top: 7.5,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
});
