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

// ── SAF scanning helpers (Android only) ────────────────────────────────────────

const MEDIA_EXTS =
  /\.(jpe?g|png|gif|heic|heif|webp|tiff?|bmp|mp4|mov|avi|mkv|m4v|3gp|webm)$/i;
const VIDEO_EXTS = /\.(mp4|mov|avi|mkv|m4v|3gp|webm)$/i;

function getSafFilename(uri: string): string {
  const encoded = uri.split("%2F").pop() ?? uri.split("/").pop() ?? "";
  return decodeURIComponent(encoded.replace(/\+/g, "%20"));
}

function parseFilenameTimestamp(filename: string): number {
  // WhatsApp: IMG-YYYYMMDD-WA####.ext
  const wa = filename.match(/[A-Za-z]+-(\d{8})-WA\d+\./i);
  if (wa) {
    const d = wa[1];
    const t = new Date(
      +d.slice(0, 4),
      +d.slice(4, 6) - 1,
      +d.slice(6, 8),
    ).getTime();
    if (t > 0) return t;
  }
  // Telegram: photo_YYYY-MM-DD_HH-MM-SS or video_YYYY-MM-DD_HH-MM-SS
  const tg = filename.match(
    /\w+_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/,
  );
  if (tg) {
    const t = new Date(
      +tg[1],
      +tg[2] - 1,
      +tg[3],
      +tg[4],
      +tg[5],
      +tg[6],
    ).getTime();
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

async function scanSafDir(dirUri: string, depth = 0): Promise<Photo[]> {
  if (depth > 7) return [];
  let entries: string[];
  try {
    entries =
      await FileSystem.StorageAccessFramework.readDirectoryAsync(dirUri);
  } catch {
    return [];
  }
  const photos: Photo[] = [];
  for (const entry of entries) {
    const filename = getSafFilename(entry);
    if (!filename) continue;
    if (MEDIA_EXTS.test(filename)) {
      photos.push({
        id: `saf:${entry}`,
        uri: entry,
        width: 0,
        height: 0,
        creationTime: parseFilenameTimestamp(filename) || Date.now(),
        duration: 0,
        mediaType: VIDEO_EXTS.test(filename) ? "video" : "photo",
        filename,
      });
    } else if (!filename.startsWith(".")) {
      const sub = await scanSafDir(entry, depth + 1);
      photos.push(...sub);
    }
  }
  return photos;
}

export type RecentlyDeletedPhoto = Photo & { deletedAt: number };

export type PermissionState = "undetermined" | "granted" | "limited" | "denied";

function mapPermission(
  res: MediaLibrary.PermissionResponse | null,
): PermissionState {
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

  // ── persistence helpers ─────────────────────────────────────────────────────

  const persistDeletedItems = useCallback((items: RecentlyDeletedPhoto[]) => {
    setDeletedItems(items);
    AsyncStorage.setItem(RECENTLY_DELETED_KEY, JSON.stringify(items)).catch(
      () => {},
    );
  }, []);

  // ── permission ──────────────────────────────────────────────────────────────

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

  // ── loading ─────────────────────────────────────────────────────────────────

  const loadPage = useCallback(
    async (after: string | undefined, replace: boolean) => {
      // refresh (replace=true) always proceeds; loadMore waits for idle
      if (!replace && loadingRef.current) return;
      if (permission !== "granted" && permission !== "limited") return;
      const gen = ++loadGenRef.current;
      loadingRef.current = true;
      setLoading(true);
      try {
        const result = await MediaLibrary.getAssetsAsync({
          mediaType: ["photo", "video", "audio", "unknown"],
          first: PAGE_SIZE,
          after,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        });
        // discard if a newer refresh has already superseded this load
        if (gen !== loadGenRef.current) return;
        const mapped: Photo[] = result.assets.map((a) => ({
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

  // ── startup effects ─────────────────────────────────────────────────────────

  useEffect(() => {
    refreshPermission();
  }, [refreshPermission]);

  useEffect(() => {
    AsyncStorage.getItem(RECENTLY_DELETED_KEY)
      .then((v) => {
        if (!v) return;
        const parsed = JSON.parse(v) as RecentlyDeletedPhoto[];
        if (Array.isArray(parsed)) setDeletedItems(parsed);
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
    AsyncStorage.getItem(ARCHIVE_KEY)
      .then((v) => {
        if (!v) return;
        const parsed = JSON.parse(v) as string[];
        if (Array.isArray(parsed)) setArchivedIds(new Set(parsed));
      })
      .catch(() => {});
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

  // ── SAF scanning (Android only) ─────────────────────────────────────────────

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
        FileSystem.StorageAccessFramework.getUriForDirectoryInRoot(
          "Android/media",
        );
      const result =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
          initialUri,
        );
      if (result.granted) {
        await AsyncStorage.setItem(
          SAF_MEDIA_URI_KEY,
          result.directoryUri,
        ).catch(() => {});
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

  // ── derived lists ───────────────────────────────────────────────────────────

  const deletedIds = useMemo(
    () => new Set(deletedItems.map((item) => item.id)),
    [deletedItems],
  );

  const allRaw = useMemo(
    () =>
      safPhotos.length === 0
        ? rawPhotos
        : [...rawPhotos, ...safPhotos].sort(
            (a, b) => b.creationTime - a.creationTime,
          ),
    [rawPhotos, safPhotos],
  );

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

  // ── recently deleted ────────────────────────────────────────────────────────

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
    (photoIds: string[]) => {
      const idSet = new Set(photoIds);
      const toAdd = photos
        .filter((p) => idSet.has(p.id))
        .map((p) => ({ ...p, deletedAt: Date.now() }));
      persistDeletedItems([
        ...toAdd,
        ...deletedItems.filter((item) => !idSet.has(item.id)),
      ]);
    },
    [photos, deletedItems, persistDeletedItems],
  );

  const restoreDeletedPhoto = useCallback(
    (id: string) => {
      persistDeletedItems(deletedItems.filter((item) => item.id !== id));
    },
    [deletedItems, persistDeletedItems],
  );

  const deletePhotoForever = useCallback(
    async (id: string) => {
      await MediaLibrary.deleteAssetsAsync([id]);
      persistDeletedItems(deletedItems.filter((item) => item.id !== id));
      setRawPhotos((prev) => prev.filter((p) => p.id !== id));
    },
    [deletedItems, persistDeletedItems],
  );

  // ── favorites ───────────────────────────────────────────────────────────────

  const toggleFavorite = useCallback((id: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      AsyncStorage.setItem(
        FAVORITES_KEY,
        JSON.stringify(Array.from(next)),
      ).catch(() => {});
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
      AsyncStorage.setItem(
        FAVORITES_KEY,
        JSON.stringify(Array.from(next)),
      ).catch(() => {});
      return next;
    });
  }, []);

  // ── archive ─────────────────────────────────────────────────────────────────

  const archivePhoto = useCallback((id: string) => {
    setArchivedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(Array.from(next))).catch(
        () => {},
      );
      return next;
    });
  }, []);

  const archivePhotosBulk = useCallback((ids: string[]) => {
    setArchivedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(Array.from(next))).catch(
        () => {},
      );
      return next;
    });
  }, []);

  const unarchivePhoto = useCallback((id: string) => {
    setArchivedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(Array.from(next))).catch(
        () => {},
      );
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
      totalCount: totalCount + safPhotos.length,
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
      deletePhotoForever,
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
      totalCount,
      safPhotos.length,
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
      deletePhotoForever,
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
  if (!ctx)
    throw new Error("usePhotos must be used within PhotoLibraryProvider");
  return ctx;
}
