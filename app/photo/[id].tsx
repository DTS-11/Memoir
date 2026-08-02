import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
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
import { photoFromParams } from "../../src/utils/photoParams";
import { semantic } from "../../src/theme/tokens";
import { VideoView, useVideoPlayer } from "expo-video";
import { useEvent } from "expo";

type AssetDetails = Photo & {
  localUri?: string | null;
  exif?: Record<string, any> | null;
};

export default function PhotoViewer() {
  const params = useLocalSearchParams<Record<string, string>>();
  const id = params.id;
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const {
    photos,
    moveToRecentlyDeleted,
    toggleFavorite,
    favoriteIds,
    archivePhoto,
    hiddenIds,
    hidePhoto,
    unhidePhoto,
  } = usePhotos();
  const listRef = useRef<FlatList<Photo>>(null);

  // The tapped photo may be passed along so the viewer can show it instantly,
  // even before the library loads or when it isn't part of the main grid (e.g.
  // opened from Archive or a filtered view).
  const paramPhoto = useMemo(() => photoFromParams(params), [params]);
  const fallbackPhoto = useMemo(
    () => photos.find((p) => p.id === id) ?? paramPhoto,
    [id, photos, paramPhoto],
  );
  const inLibrary = photos.some((p) => p.id === id);
  const [directPhoto, setDirectPhoto] = useState<Photo | null>(null);
  const data = inLibrary
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
  // Prevents the video effect from firing before the index-correction effect runs.
  // Without this, currentIndex starts at 0 on mount and the wrong item auto-plays.
  const indexReadyRef = useRef(photos.length > 0);
  const [details, setDetails] = useState<AssetDetails | null>(fallbackPhoto ?? null);
  // Per-photo resolved local file URI. Kept as a stable map (keyed by photo id)
  // so each paged cell renders the same source forever — never the previous
  // item's localUri, which is what caused the "previous image pops up" flash.
  const [localUriMap, setLocalUriMap] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const fetchedLocalUriRef = useRef<Set<string>>(new Set());
  const [chromeVisible, setChromeVisible] = useState(true);
  const [infoVisible, setInfoVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [slideshowActive, setSlideshowActive] = useState(false);
  const slideshowRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const SLIDESHOW_INTERVAL_MS = 3000;
  const chromeVisibleSV = useSharedValue(chromeVisible);
  chromeVisibleSV.value = chromeVisible;

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
  const { currentTime: videoCurrentTime } = useEvent(videoPlayer, "timeUpdate", {
    currentTime: 0,
    bufferedPosition: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
  });
  const { status: videoStatus } = useEvent(videoPlayer, "statusChange", {
    status: videoPlayer.status,
    error: undefined,
  });

  const current = data[currentIndex] ?? fallbackPhoto ?? directPhoto;
  const currentRef = useRef(current);
  currentRef.current = current;
  const isCurrentVideo = current?.mediaType === "video";
  const isCurrentAudio = current?.mediaType === "audio";
  const isCurrentPlayable = isCurrentVideo || isCurrentAudio;

  const [videoDuration, setVideoDuration] = useState(0);
  // Tied to statusChange, not timeUpdate, to avoid running 4×/s
  useEffect(() => {
    const d = videoPlayer.duration;
    if (d > 0) setVideoDuration(d);
  }, [videoStatus, videoPlayer]);

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
    indexReadyRef.current = true;
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
        setDetails({
          ...next,
          localUri: info.localUri,
          exif: (info as any).exif ?? null,
        });
      })
      .catch(() => {});
  }, [data.length, id]);

  useEffect(() => {
    const cur = currentRef.current;
    if (!cur?.id) return;
    resetZoom();
    setInfoVisible(false);
    MediaLibrary.getAssetInfoAsync(cur.id)
      .then((info) => {
        if (!info) return;
        setDetails({
          id: info.id,
          uri: info.uri,
          localUri: info.localUri,
          exif: (info as any).exif ?? null,
          width: info.width,
          height: info.height,
          creationTime: info.creationTime,
          duration: info.duration,
          mediaType: info.mediaType,
          filename: info.filename,
        });
      })
      .catch(() => setDetails(cur));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, resetZoom]);

  useEffect(() => {
    if (!indexReadyRef.current) return;
    if (
      (current?.mediaType === "video" || current?.mediaType === "audio") &&
      current.uri
    ) {
      setVideoDuration(0);
      videoPlayer.replace(current.uri);
      videoPlayer.play();
    } else {
      videoPlayer.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.mediaType]);

  useEffect(() => {
    return () => {
      try {
        videoPlayer.pause();
      } catch {}
    };
  }, [videoPlayer]);

  // Pause when navigating away (handles system back gesture, not just the button)
  useFocusEffect(
    useCallback(() => {
      return () => {
        try {
          videoPlayer.pause();
        } catch {}
      };
    }, [videoPlayer]),
  );

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
      if (v && slideshowRef.current) {
        clearInterval(slideshowRef.current);
        slideshowRef.current = null;
        setSlideshowActive(false);
      }
    },
    [chromeOpacity],
  );

  const stopSlideshow = useCallback(() => {
    if (slideshowRef.current) clearInterval(slideshowRef.current);
    slideshowRef.current = null;
    setSlideshowActive(false);
  }, []);

  const dataLengthRef = useRef(data.length);
  dataLengthRef.current = data.length;

  const startSlideshow = useCallback(() => {
    setSlideshowActive(true);
    setChrome(false);
    const intervalId = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = prev + 1;
        if (next >= dataLengthRef.current) {
          clearInterval(intervalId);
          slideshowRef.current = null;
          setSlideshowActive(false);
          return prev;
        }
        listRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, SLIDESHOW_INTERVAL_MS);
    slideshowRef.current = intervalId;
  }, [setChrome]);

  useEffect(() => {
    return () => {
      if (slideshowRef.current) clearInterval(slideshowRef.current);
    };
  }, []);

  const goBack = useCallback(() => {
    try {
      videoPlayer.pause();
    } catch {}
    router.back();
  }, [videoPlayer]);

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(1)
        .onEnd(() => {
          runOnJS(setChrome)(!chromeVisibleSV.value);
        }),
    [setChrome, chromeVisibleSV],
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
          } else if (Math.abs(e.translationY) > 130 || Math.abs(e.velocityY) > 900) {
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

  // Resolve a stable file URI for the current page and its neighbours so a
  // swipe never waits on (or flashes) a stale source. Resolves once per photo.
  const resolveLocalUris = useCallback(
    (index: number) => {
      const start = Math.max(0, index - 1);
      const end = Math.min(data.length - 1, index + 1);
      for (let i = start; i <= end; i++) {
        const item = data[i];
        if (!item || fetchedLocalUriRef.current.has(item.id)) continue;
        fetchedLocalUriRef.current.add(item.id);
        MediaLibrary.getAssetInfoAsync(item.id)
          .then((info) => {
            const localUri = info?.localUri;
            if (!localUri) return;
            setLocalUriMap((prev) => {
              const next = new Map(prev);
              next.set(info.id, localUri);
              return next;
            });
          })
          .catch(() => {});
      }
    },
    [data],
  );

  useEffect(() => {
    if (data.length === 0) return;
    resolveLocalUris(currentIndex);
  }, [currentIndex, data, resolveLocalUris]);

  const shareCurrent = useCallback(async () => {
    if (!current) return;
    Haptics.selectionAsync();

    let srcUri: string | null = null;
    if (details?.localUri) {
      srcUri = details.localUri;
    } else {
      const info = await MediaLibrary.getAssetInfoAsync(current.id).catch(() => null);
      srcUri = info?.localUri ?? current.uri ?? null;
    }

    if (!srcUri) {
      Alert.alert(
        "Unable to Share",
        "Could not resolve a local file path for this item.",
      );
      return;
    }

    try {
      let shareUri = srcUri;
      if (Platform.OS === "android" && srcUri.startsWith("content://")) {
        const ext = current.filename.split(".").pop() ?? "jpg";
        const dest = `${FileSystem.cacheDirectory}share_${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: srcUri, to: dest });
        shareUri = dest;
      }
      await Sharing.shareAsync(shareUri, {
        mimeType: mimeTypeFor(current.filename, current.mediaType as string),
        dialogTitle: current.filename,
      });
    } catch {
      Alert.alert("Unable to Share", "Could not share this item.");
    }
  }, [current, details]);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), 1600);
  }, []);

  const handleToggleFavorite = useCallback(() => {
    if (!current) return;
    Haptics.selectionAsync();
    toggleFavorite(current.id);
  }, [current, toggleFavorite]);

  const resolveLocalUri = useCallback(async (): Promise<string | null> => {
    if (!current) return null;
    if (details?.localUri) return details.localUri;
    const info = await MediaLibrary.getAssetInfoAsync(current.id).catch(() => null);
    return info?.localUri ?? current.uri ?? null;
  }, [current, details]);

  const copyCurrent = useCallback(async () => {
    if (!current) return;
    Haptics.selectionAsync();
    setMenuVisible(false);
    const srcUri = await resolveLocalUri();
    if (!srcUri) {
      Alert.alert("Unable to Copy", "Could not resolve a local file path for this item.");
      return;
    }
    try {
      let copied = false;
      if (current.mediaType === "photo") {
        const finfo = await FileSystem.getInfoAsync(srcUri).catch(() => null);
        const tooBig =
          finfo?.exists === true &&
          typeof finfo.size === "number" &&
          finfo.size > 20 * 1024 * 1024;
        if (!tooBig) {
          const b64 = await FileSystem.readAsStringAsync(srcUri, {
            encoding: FileSystem.EncodingType.Base64,
          }).catch(() => null);
          if (b64) {
            await Clipboard.setImageAsync(b64);
            copied = true;
          }
        }
      }
      if (!copied) {
        await Clipboard.setStringAsync(current.filename);
      }
      showToast("Copied to Clipboard");
    } catch {
      Alert.alert("Unable to Copy", "Could not copy this item.");
    }
  }, [current, resolveLocalUri, showToast]);

  const handleHide = useCallback(() => {
    if (!current) return;
    setMenuVisible(false);
    if (hiddenIds.has(current.id)) {
      unhidePhoto(current.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("Unhidden");
      return;
    }
    Alert.alert(
      "Hide Photo?",
      "It will be removed from your library and only visible in Albums → Hidden, protected by your device lock.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Hide",
          style: "destructive",
          onPress: () => {
            hidePhoto(current.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          },
        },
      ],
    );
  }, [current, hiddenIds, hidePhoto, unhidePhoto, showToast]);

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
    Alert.alert("Delete Photo?", "The item will be moved to Recently Deleted.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          moveToRecentlyDeleted(current);
          router.back();
        },
      },
    ]);
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
  const isHidden = current ? hiddenIds.has(current.id) : false;

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
              const isAudioItem = item.mediaType === "audio";
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
                    ) : isAudioItem ? (
                      <View style={[styles.audioPage, { width, height }]}>
                        <Ionicons
                          name="musical-notes"
                          size={88}
                          color="rgba(255,255,255,0.18)"
                        />
                        <Text style={styles.audioFilename} numberOfLines={2}>
                          {item.filename}
                        </Text>
                      </View>
                    ) : (
                      <Image
                        source={{
                          uri: localUriMap.get(item.id) ?? item.uri,
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
            onScrollBeginDrag={stopSlideshow}
            showsHorizontalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
            windowSize={3}
            maxToRenderPerBatch={2}
            initialNumToRender={1}
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
          <Pressable onPress={goBack} hitSlop={12} style={styles.iconBtn}>
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
          {current?.mediaType === "photo" && (
            <Pressable
              onPress={slideshowActive ? stopSlideshow : startSlideshow}
              hitSlop={12}
              style={styles.iconBtn}
            >
              <Ionicons
                name={slideshowActive ? "pause-circle-outline" : "play-circle-outline"}
                size={28}
                color="#FFF"
              />
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              setInfoVisible(false);
              setMenuVisible((v) => !v);
            }}
            hitSlop={12}
            style={styles.iconBtn}
          >
            <Ionicons name="ellipsis-horizontal-circle" size={28} color="#FFF" />
          </Pressable>
        </GlassView>
      </Animated.View>

      <Animated.View
        pointerEvents={chromeVisible ? "box-none" : "none"}
        style={[styles.bottomChrome, chromeStyle]}
      >
        {infoVisible && current && (
          <GlassView intensity={72} style={styles.infoPanel}>
            <InfoRow label="File" value={details?.filename || current.filename} />
            <InfoRow
              label="Size"
              value={`${details?.width || current.width} × ${details?.height || current.height}`}
            />
            <InfoRow
              label="Type"
              value={
                current.mediaType === "video"
                  ? "Video"
                  : current.mediaType === "audio"
                    ? "Audio"
                    : current.mediaType === "photo"
                      ? "Photo"
                      : "Unknown"
              }
            />
            {details?.exif &&
              (() => {
                const exif = details.exif;
                const camera = formatCamera(exif);
                const lens = [
                  formatAperture(exif),
                  formatShutter(exif),
                  formatISO(exif),
                  formatFocal(exif),
                ]
                  .filter(Boolean)
                  .join("  ·  ");
                const gps = formatGPS(exif);
                return (
                  <>
                    {camera ? <InfoRow label="Camera" value={camera} /> : null}
                    {lens ? <InfoRow label="Lens" value={lens} /> : null}
                    {gps ? (
                      <InfoRow
                        label="Location"
                        value={gps.text}
                        onPress={() =>
                          Linking.openURL(
                            `geo:${gps.lat},${gps.lng}?q=${gps.lat},${gps.lng}`,
                          )
                        }
                      />
                    ) : null}
                  </>
                );
              })()}
          </GlassView>
        )}
        {isCurrentPlayable && (
          <GlassView intensity={72} style={styles.videoControls}>
            <Pressable
              onPress={toggleVideoPlayback}
              hitSlop={12}
              style={styles.videoPlayBtn}
            >
              <Ionicons name={videoPlaying ? "pause" : "play"} size={26} color="#FFF" />
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
          style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}
        >
          <ActionBtn icon="share-outline" label="Share" onPress={shareCurrent} />
          <ActionBtn
            icon={isFavorite ? "heart" : "heart-outline"}
            label="Favorite"
            onPress={handleToggleFavorite}
            active={isFavorite}
          />
          <ActionBtn icon="archive-outline" label="Archive" onPress={handleArchive} />
          <ActionBtn
            icon="trash-outline"
            label="Delete"
            onPress={deleteCurrent}
            destructive
          />
        </GlassView>
      </Animated.View>

      {menuVisible && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)} />
          <GlassView
            interactive
            intensity={88}
            style={[styles.menuSheet, { bottom: insets.bottom + 108 }]}
          >
            <Text style={styles.menuTitle} numberOfLines={1}>
              {details?.filename || current?.filename}
            </Text>
            <MenuRow
              icon="copy-outline"
              label="Copy to Clipboard"
              onPress={copyCurrent}
            />
            <MenuRow
              icon={isHidden ? "eye-outline" : "eye-off-outline"}
              label={isHidden ? "Unhide" : "Hide"}
              onPress={handleHide}
            />
            <MenuRow
              icon="information-circle-outline"
              label="Info"
              onPress={() => {
                setMenuVisible(false);
                setInfoVisible(true);
              }}
            />
            <View style={styles.menuDivider} />
            <MenuRow
              icon="trash-outline"
              label="Delete"
              destructive
              onPress={() => {
                setMenuVisible(false);
                deleteCurrent();
              }}
            />
          </GlassView>
        </View>
      )}

      {toast && (
        <View
          style={[styles.toast, { bottom: insets.bottom + 116 }]}
          pointerEvents="none"
        >
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
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
  const color = destructive ? semantic.delete : active ? semantic.favorite : "#FFF";
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

function MenuRow({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const color = destructive ? semantic.delete : "#FFF";
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.5 }]}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.menuRowText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function InfoRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const row = (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2} selectable={!onPress}>
        {value}
      </Text>
      {onPress && (
        <Ionicons name="open-outline" size={13} color="rgba(255,255,255,0.45)" />
      )}
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.65 }}>
        {row}
      </Pressable>
    );
  }
  return row;
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
  audioPage: {
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  audioFilename: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    paddingHorizontal: 40,
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
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  menuSheet: {
    position: "absolute",
    left: 12,
    right: 12,
    borderRadius: 22,
    borderCurve: "continuous",
    paddingHorizontal: 8,
    paddingTop: 14,
    paddingBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  menuTitle: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  menuRowText: {
    fontSize: 16,
    fontWeight: "500",
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.14)",
    marginHorizontal: 14,
    marginVertical: 6,
  },
  toast: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "rgba(40,40,40,0.92)",
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    borderCurve: "continuous",
  },
  toastText: {
    color: "#FFF",
    fontSize: 13,
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

function formatAperture(exif: Record<string, any>): string | null {
  const v = exif["FNumber"] ?? exif["ApertureValue"];
  if (v == null) return null;
  const n = parseFloat(v);
  if (isNaN(n) || n <= 0) return null;
  return `ƒ/${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)}`;
}

function formatShutter(exif: Record<string, any>): string | null {
  const v = exif["ExposureTime"];
  if (v == null) return null;
  const n = parseFloat(v);
  if (isNaN(n) || n <= 0) return null;
  if (n >= 1) return `${n.toFixed(0)}s`;
  return `1/${Math.round(1 / n)}s`;
}

function formatISO(exif: Record<string, any>): string | null {
  const raw = exif["ISOSpeedRatings"] ?? exif["PhotographicSensitivity"];
  if (raw == null) return null;
  const n = parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
  if (isNaN(n)) return null;
  return `ISO ${n}`;
}

function formatFocal(exif: Record<string, any>): string | null {
  const v = exif["FocalLength"] ?? exif["FocalLengthIn35mmFilm"];
  if (v == null) return null;
  const n = parseFloat(v);
  if (isNaN(n) || n <= 0) return null;
  return `${Math.round(n)}mm`;
}

function formatCamera(exif: Record<string, any>): string | null {
  const make = String(exif["Make"] ?? "").trim();
  const model = String(exif["Model"] ?? "").trim();
  if (!model && !make) return null;
  if (!model) return make;
  if (make && !model.toLowerCase().startsWith(make.toLowerCase())) {
    return `${make} ${model}`;
  }
  return model;
}

function formatGPS(
  exif: Record<string, any>,
): { text: string; lat: number; lng: number } | null {
  const rawLat = exif["GPSLatitude"];
  const rawLng = exif["GPSLongitude"];
  if (rawLat == null || rawLng == null) return null;
  const latRef = String(exif["GPSLatitudeRef"] ?? "N").toUpperCase();
  const lngRef = String(exif["GPSLongitudeRef"] ?? "E").toUpperCase();
  const toDeg = (v: any): number => {
    if (Array.isArray(v))
      return parseFloat(v[0]) + parseFloat(v[1]) / 60 + parseFloat(v[2]) / 3600;
    return parseFloat(v);
  };
  const latDeg = toDeg(rawLat);
  const lngDeg = toDeg(rawLng);
  if (isNaN(latDeg) || isNaN(lngDeg)) return null;
  const lat = latDeg * (latRef === "S" ? -1 : 1);
  const lng = lngDeg * (lngRef === "W" ? -1 : 1);
  const fmtCoord = (d: number, pos: string, neg: string) =>
    `${Math.abs(d).toFixed(4)}° ${d >= 0 ? pos : neg}`;
  return {
    text: `${fmtCoord(lat, "N", "S")}, ${fmtCoord(lng, "E", "W")}`,
    lat,
    lng,
  };
}

function mimeTypeFor(filename: string, mediaType: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (mediaType === "video") {
    const map: Record<string, string> = {
      mp4: "video/mp4",
      mov: "video/quicktime",
      m4v: "video/x-m4v",
      avi: "video/x-msvideo",
      mkv: "video/x-matroska",
      webm: "video/webm",
    };
    return map[ext] ?? "video/mp4";
  }
  if (mediaType === "audio") {
    const map: Record<string, string> = {
      mp3: "audio/mpeg",
      m4a: "audio/m4a",
      aac: "audio/aac",
      wav: "audio/wav",
      flac: "audio/flac",
      ogg: "audio/ogg",
    };
    return map[ext] ?? "audio/mpeg";
  }
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    heic: "image/heic",
    heif: "image/heif",
    gif: "image/gif",
    webp: "image/webp",
    tiff: "image/tiff",
    tif: "image/tiff",
    bmp: "image/bmp",
  };
  return map[ext] ?? "image/jpeg";
}

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
      thumbX.value = (Math.min(currentTime, duration) / duration) * barWidth.value;
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
    transform: [{ translateX: thumbX.value - 6.5 }, { scale: thumbScale.value }],
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
