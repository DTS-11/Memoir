import * as MediaLibrary from "expo-media-library/legacy";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, Platform } from "react-native";

export type Photo = {
  id: string;
  uri: string;
  width: number;
  height: number;
  creationTime: number;
  duration: number;
  mediaType: MediaLibrary.MediaTypeValue;
  filename: string;
};

const PAGE_SIZE = 200;
const RECENTLY_DELETED_KEY = "memoir.recentlyDeleted.v1";
const FAVORITES_KEY = "memoir.favorites.v1";
const ARCHIVE_KEY = "memoir.archived.v1";
const SAF_MEDIA_URI_KEY = "memoir.safMediaUri.v1";
const SAF_DISMISSED_KEY = "memoir.safDismissed.v1";
// Legacy key from when Archive and Hidden were separate features.
const LEGACY_HIDDEN_KEY = "memoir.hidden.v1";

const MEDIA_EXTS = /\.(jpe?g|png|gif|heic|heif|tiff?|bmp|mp4|mov|avi|mkv|m4v|3gp|webm)$/i;
const VIDEO_EXTS = /\.(mp4|mov|avi|mkv|m4v|3gp|webm)$/i;
// Directories that contain no user photos/videos worth indexing
const SKIP_DIR_NAMES =
  /sticker|document|audio|voice.?note|profile.?photo|status|wallpaper|animated.?gif|\bsent\b/i;

// URI path segments that indicate sent/non-user media or system trash
const EXCLUDED_URI_SEGMENTS =
  /\/[Ss]ent\/|WhatsApp\s+Animated\s+Gifs|WhatsApp\s+Stickers|WhatsApp\s+Documents|\/\.trash\/|\/\.Trash-\d+\/|\/MIUI\/gallery\/cloud\/recycle\/|\/MIUI\/Recycle\//;

function isExcludedMediaUri(uri: string): boolean {
  const decoded = decodeURIComponent(uri);
  // Also reject clearly broken entries (DATA column was NULL → "file://null")
  if (decoded === "file://null" || decoded === "file://") return true;
  return EXCLUDED_URI_SEGMENTS.test(decoded);
}

function getSafFilename(uri: string): string {
  const encoded = uri.split("%2F").pop() ?? uri.split("/").pop() ?? "";
  return decodeURIComponent(encoded.replace(/\+/g, "%20"));
}

function parseFilenameTimestamp(filename: string): number {
  // WhatsApp: IMG-YYYYMMDD-WA####.ext
  const wa = filename.match(/[A-Za-z]+-(\d{8})-WA\d+\./i);
  if (wa) {
    const d = wa[1];
    const t = new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)).getTime();
    if (t > 0) return t;
  }
  // Telegram: photo_YYYY-MM-DD_HH-MM-SS or video_YYYY-MM-DD_HH-MM-SS
  const tg = filename.match(/\w+_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/);
  if (tg) {
    const t = new Date(+tg[1], +tg[2] - 1, +tg[3], +tg[4], +tg[5], +tg[6]).getTime();
    if (t > 0) return t;
  }
  // 13-digit unix timestamp in filename
  const ts = filename.match(/^(\d{13})\./);
  if (ts) {
    const t = +ts[1];
    if (t > 1_000_000_000_000) return t;
  }
  return 0;
}

/**
 * Stable fallback timestamp for SAF files whose filenames carry no date.
 * Hashing the URI produces a value that won't change between app launches
 * (unlike Date.now()), so the file sorts consistently in the library.
 * The result is mapped to a plausible range (2010-2020) so it doesn't
 * appear at the very top or very bottom of the chronological list.
 */
function stableTimestampFromUri(uri: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < uri.length; i++) {
    h ^= uri.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const RANGE_START = new Date(2010, 0, 1).getTime();
  const RANGE_END = new Date(2020, 0, 1).getTime();
  return RANGE_START + (Math.abs(h) % (RANGE_END - RANGE_START));
}

async function scanSafDir(dirUri: string, depth = 0): Promise<Photo[]> {
  if (depth > 7) return [];
  let entries: string[];
  try {
    entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(dirUri);
  } catch {
    return [];
  }
  const photos: Photo[] = [];
  const subDirs: string[] = [];
  for (const entry of entries) {
    const filename = getSafFilename(entry);
    if (!filename || filename.startsWith(".")) continue;
    if (MEDIA_EXTS.test(filename)) {
      photos.push({
        id: `saf:${entry}`,
        uri: entry,
        width: 0,
        height: 0,
        creationTime: parseFilenameTimestamp(filename) || stableTimestampFromUri(entry),
        duration: 0,
        mediaType: VIDEO_EXTS.test(filename) ? "video" : "photo",
        filename,
      });
    } else if (!SKIP_DIR_NAMES.test(filename)) {
      subDirs.push(entry);
    }
  }
  const subResults = await Promise.all(subDirs.map((dir) => scanSafDir(dir, depth + 1)));
  for (const sub of subResults) photos.push(...sub);
  return photos;
}

export type RecentlyDeletedPhoto = Photo & { deletedAt: number };

export type PermissionState = "undetermined" | "granted" | "limited" | "denied";

function mapPermission(res: MediaLibrary.PermissionResponse | null): PermissionState {
  if (!res) return "undetermined";
  if (res.accessPrivileges === "limited") return "limited";
  if (res.status === "granted") return "granted";
  if (res.status === "denied") return "denied";
  return "undetermined";
}

function usePhotosController() {
  const [permission, setPermission] = useState<PermissionState>("undetermined");
  const [rawPhotos, setRawPhotos] = useState<Photo[]>([]);
  const [safPhotos, setSafPhotos] = useState<Photo[]>([]);
  const [safNeedsPermission, setSafNeedsPermission] = useState(false);
  const [deletedItems, setDeletedItems] = useState<RecentlyDeletedPhoto[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const endCursorRef = useRef<string | undefined>(undefined);
  const loadingRef = useRef(false);
  const loadGenRef = useRef(0);

  const persistDeletedItems = useCallback((items: RecentlyDeletedPhoto[]) => {
    setDeletedItems(items);
    AsyncStorage.setItem(RECENTLY_DELETED_KEY, JSON.stringify(items)).catch(() => {});
  }, []);

  const refreshPermission = useCallback(async () => {
    const res = await MediaLibrary.getPermissionsAsync();
    const next = mapPermission(res);
    setPermission(next);
    return next;
  }, []);

  const requestPermission = useCallback(async () => {
    const res = await MediaLibrary.requestPermissionsAsync(false);
    const next = mapPermission(res);
    setPermission(next);
    return next;
  }, []);

  const loadPage = useCallback(
    async (after: string | undefined, replace: boolean) => {
      if (!replace && loadingRef.current) return;
      if (permission !== "granted" && permission !== "limited") return;
      const gen = ++loadGenRef.current;
      loadingRef.current = true;
      setLoading(true);
      try {
        const result = await MediaLibrary.getAssetsAsync({
          mediaType: ["photo", "video"],
          first: PAGE_SIZE,
          after,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        });
        if (gen !== loadGenRef.current) return; // superseded by a newer refresh
        const mapped: Photo[] = result.assets
          .filter((a) => !isExcludedMediaUri(a.uri))
          .map((a) => ({
            id: a.id,
            uri: a.uri,
            width: a.width,
            height: a.height,
            creationTime: a.creationTime,
            duration: a.duration,
            mediaType: a.mediaType,
            filename: a.filename,
          }));
        setRawPhotos((prev) => (replace ? mapped : [...prev, ...mapped]));
        setTotalCount(result.totalCount);
        endCursorRef.current = result.endCursor;
        setHasMore(result.hasNextPage);
      } finally {
        if (gen === loadGenRef.current) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    },
    [permission],
  );

  const loadMore = useCallback(async () => {
    if (!hasMore) return;
    await loadPage(endCursorRef.current, false);
  }, [hasMore, loadPage]);

  const refresh = useCallback(async () => {
    endCursorRef.current = undefined;
    setHasMore(true);
    await loadPage(undefined, true);
  }, [loadPage]);

  useEffect(() => {
    refreshPermission();
  }, [refreshPermission]);

  useEffect(() => {
    AsyncStorage.getItem(RECENTLY_DELETED_KEY)
      .then((v) => {
        if (!v) return;
        const parsed = JSON.parse(v) as RecentlyDeletedPhoto[];
        if (!Array.isArray(parsed)) return;
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const fresh = parsed.filter((item) => now - item.deletedAt < THIRTY_DAYS_MS);
        setDeletedItems(fresh);
        if (fresh.length !== parsed.length) {
          AsyncStorage.setItem(RECENTLY_DELETED_KEY, JSON.stringify(fresh)).catch(
            () => {},
          );
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(FAVORITES_KEY)
      .then((v) => {
        if (!v) return;
        const parsed = JSON.parse(v) as string[];
        if (Array.isArray(parsed)) setFavoriteIds(new Set(parsed));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [archiveRaw, hiddenRaw] = await Promise.all([
          AsyncStorage.getItem(ARCHIVE_KEY),
          AsyncStorage.getItem(LEGACY_HIDDEN_KEY),
        ]);
        const archiveIds: string[] = archiveRaw ? JSON.parse(archiveRaw) : [];
        const hiddenIds: string[] = hiddenRaw ? JSON.parse(hiddenRaw) : [];
        const merged = Array.from(new Set([...archiveIds, ...hiddenIds]));
        if (merged.length > 0) {
          setArchivedIds(new Set(merged));
          await AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(merged));
          if (hiddenRaw) await AsyncStorage.removeItem(LEGACY_HIDDEN_KEY);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (permission === "granted" || permission === "limited") refresh();
  }, [permission, refresh]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = MediaLibrary.addListener(() => {
      refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        refreshPermission();
        refresh();
      }
    });
    return () => sub.remove();
  }, [refreshPermission, refresh]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    (async () => {
      try {
        const [[, savedUri], [, dismissed]] = await AsyncStorage.multiGet([
          SAF_MEDIA_URI_KEY,
          SAF_DISMISSED_KEY,
        ]);
        if (dismissed === "1") return;
        if (!savedUri) {
          setSafNeedsPermission(true);
          return;
        }
        const found = await scanSafDir(savedUri);
        if (found.length > 0) {
          setSafPhotos(found);
        } else {
          await AsyncStorage.removeItem(SAF_MEDIA_URI_KEY).catch(() => {});
          setSafNeedsPermission(true);
        }
      } catch {}
    })();
  }, []);

  const requestSafAccess = useCallback(async () => {
    if (Platform.OS !== "android") return;
    try {
      const initialUri =
        FileSystem.StorageAccessFramework.getUriForDirectoryInRoot("Android/media");
      const result =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
          initialUri,
        );
      if (result.granted) {
        await AsyncStorage.setItem(SAF_MEDIA_URI_KEY, result.directoryUri).catch(
          () => {},
        );
        setSafNeedsPermission(false);
        const found = await scanSafDir(result.directoryUri);
        setSafPhotos(found);
      }
    } catch {}
  }, []);

  const dismissSafPermission = useCallback(async () => {
    setSafNeedsPermission(false);
    await AsyncStorage.setItem(SAF_DISMISSED_KEY, "1").catch(() => {});
  }, []);

  const deletedIds = useMemo(
    () => new Set(deletedItems.map((item) => item.id)),
    [deletedItems],
  );

  const allRaw = useMemo(() => {
    if (safPhotos.length === 0) return rawPhotos;
    const mlUris = new Set(rawPhotos.map((p) => p.uri));
    const uniqueSaf = safPhotos.filter((p) => !mlUris.has(p.uri));
    return [...rawPhotos, ...uniqueSaf].sort((a, b) => b.creationTime - a.creationTime);
  }, [rawPhotos, safPhotos]);

  const photos = useMemo(
    () => allRaw.filter((p) => !deletedIds.has(p.id) && !archivedIds.has(p.id)),
    [allRaw, deletedIds, archivedIds],
  );

  const archivedPhotos = useMemo(
    () => allRaw.filter((p) => archivedIds.has(p.id) && !deletedIds.has(p.id)),
    [allRaw, archivedIds, deletedIds],
  );

  const favoritePhotos = useMemo(
    () => photos.filter((p) => favoriteIds.has(p.id)),
    [photos, favoriteIds],
  );

  const moveToRecentlyDeleted = useCallback(
    (photo: Photo) => {
      persistDeletedItems([
        { ...photo, deletedAt: Date.now() },
        ...deletedItems.filter((item) => item.id !== photo.id),
      ]);
    },
    [deletedItems, persistDeletedItems],
  );

  const moveToRecentlyDeletedBulk = useCallback(
    (photoList: Photo[]) => {
      const idSet = new Set(photoList.map((p) => p.id));
      const toAdd = photoList.map((p) => ({ ...p, deletedAt: Date.now() }));
      persistDeletedItems([
        ...toAdd,
        ...deletedItems.filter((item) => !idSet.has(item.id)),
      ]);
    },
    [deletedItems, persistDeletedItems],
  );

  const restoreDeletedPhoto = useCallback(
    (id: string) => {
      persistDeletedItems(deletedItems.filter((item) => item.id !== id));
    },
    [deletedItems, persistDeletedItems],
  );

  const restoreDeletedPhotoBulk = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids);
      persistDeletedItems(deletedItems.filter((item) => !idSet.has(item.id)));
    },
    [deletedItems, persistDeletedItems],
  );

  const deletePhotoForever = useCallback(
    async (id: string) => {
      if (id.startsWith("saf:")) {
        setSafPhotos((prev) => prev.filter((p) => p.id !== id));
      } else {
        await MediaLibrary.deleteAssetsAsync([id]).catch(() => {});
        setRawPhotos((prev) => prev.filter((p) => p.id !== id));
      }
      persistDeletedItems(deletedItems.filter((item) => item.id !== id));
    },
    [deletedItems, persistDeletedItems],
  );

  const deleteForeverBulk = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const mediaIds = ids.filter((id) => !id.startsWith("saf:"));
      const safIds = ids.filter((id) => id.startsWith("saf:"));
      if (mediaIds.length > 0) {
        await MediaLibrary.deleteAssetsAsync(mediaIds).catch(() => {});
        setRawPhotos((prev) => prev.filter((p) => !idSet.has(p.id)));
      }
      if (safIds.length > 0) {
        setSafPhotos((prev) => prev.filter((p) => !idSet.has(p.id)));
      }
      persistDeletedItems(deletedItems.filter((item) => !idSet.has(item.id)));
    },
    [deletedItems, persistDeletedItems],
  );

  const toggleFavorite = useCallback((id: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(next))).catch(
        () => {},
      );
      return next;
    });
  }, []);

  const setFavoritesBulk = useCallback((ids: string[], favorite: boolean) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        if (favorite) next.add(id);
        else next.delete(id);
      });
      AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(next))).catch(
        () => {},
      );
      return next;
    });
  }, []);

  const archivePhoto = useCallback((id: string) => {
    setArchivedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  }, []);

  const archivePhotosBulk = useCallback((ids: string[]) => {
    setArchivedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  }, []);

  const unarchivePhoto = useCallback((id: string) => {
    setArchivedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  }, []);

  return useMemo(
    () => ({
      permission,
      photos,
      archivedPhotos,
      favoritePhotos,
      favoriteIds,
      deletedItems,
      loading,
      hasMore,
      totalCount: allRaw.length,
      safNeedsPermission,
      requestSafAccess,
      dismissSafPermission,
      requestPermission,
      refreshPermission,
      loadMore,
      refresh,
      moveToRecentlyDeleted,
      moveToRecentlyDeletedBulk,
      restoreDeletedPhoto,
      restoreDeletedPhotoBulk,
      deletePhotoForever,
      deleteForeverBulk,
      toggleFavorite,
      setFavoritesBulk,
      archivePhoto,
      archivePhotosBulk,
      unarchivePhoto,
    }),
    [
      permission,
      photos,
      archivedPhotos,
      favoritePhotos,
      favoriteIds,
      deletedItems,
      loading,
      hasMore,
      allRaw.length,
      safNeedsPermission,
      requestSafAccess,
      dismissSafPermission,
      requestPermission,
      refreshPermission,
      loadMore,
      refresh,
      moveToRecentlyDeleted,
      moveToRecentlyDeletedBulk,
      restoreDeletedPhoto,
      restoreDeletedPhotoBulk,
      deletePhotoForever,
      deleteForeverBulk,
      toggleFavorite,
      setFavoritesBulk,
      archivePhoto,
      archivePhotosBulk,
      unarchivePhoto,
    ],
  );
}

type PhotoLibraryState = ReturnType<typeof usePhotosController>;
const PhotoLibraryContext = createContext<PhotoLibraryState | null>(null);

export function PhotoLibraryProvider({ children }: { children: ReactNode }) {
  const value = usePhotosController();
  return createElement(PhotoLibraryContext.Provider, { value }, children);
}

export function usePhotos() {
  const ctx = useContext(PhotoLibraryContext);
  if (!ctx) throw new Error("usePhotos must be used within PhotoLibraryProvider");
  return ctx;
}
