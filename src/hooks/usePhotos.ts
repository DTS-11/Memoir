import * as MediaLibrary from "expo-media-library/legacy";
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
// Legacy key from when Archive and Hidden were separate features.
const LEGACY_HIDDEN_KEY = "memoir.hidden.v1";
const PERMISSION_ASKED_KEY = "memoir.permissionAsked.v1";
const HIDDEN_KEY = "memoir.hiddenAlbum.v2";

// URI path segments that indicate sent/non-user media or system trash
const EXCLUDED_URI_SEGMENTS =
  /\/[Ss]ent\/|WhatsApp\s+Animated\s+Gifs|WhatsApp\s+Stickers|WhatsApp\s+Documents|\/\.trash\/|\/\.Trash-\d+\/|\/MIUI\/gallery\/cloud\/recycle\/|\/MIUI\/Recycle\//;

function isExcludedMediaUri(uri: string): boolean {
  const decoded = decodeURIComponent(uri);
  // Also reject clearly broken entries (DATA column was NULL → "file://null")
  if (decoded === "file://null" || decoded === "file://") return true;
  return EXCLUDED_URI_SEGMENTS.test(decoded);
}

function mapAssets(assets: MediaLibrary.Asset[]): Photo[] {
  return assets
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
  const [deletedItems, setDeletedItems] = useState<RecentlyDeletedPhoto[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
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
        const mapped: Photo[] = mapAssets(result.assets);
        setRawPhotos((prev) => {
          // Pagination can hand back duplicate assets when the library changes
          // between page fetches. Duplicates break the grid's keyExtractor and
          // make taps open the wrong photo, so dedupe by id, keeping first.
          const merged = replace ? mapped : [...prev, ...mapped];
          const seen = new Set<string>();
          const deduped: Photo[] = [];
          for (const p of merged) {
            if (seen.has(p.id)) continue;
            seen.add(p.id);
            deduped.push(p);
          }
          return deduped;
        });
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

  /**
   * Fetch the entire library fresh from the system, bypassing the paginated
   * in-memory list. Used when a face scan needs to be certain it has seen every
   * photo on the device (new ones may not have made it into the grid yet).
   */
  const loadAllPhotos = useCallback(async (): Promise<Photo[]> => {
    if (permission !== "granted" && permission !== "limited") return [];
    const all: Photo[] = [];
    const seen = new Set<string>();
    let after: string | undefined;
    let hasNext = true;
    while (hasNext) {
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: ["photo", "video"],
        first: PAGE_SIZE,
        after,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      for (const p of mapAssets(result.assets)) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        all.push(p);
      }
      after = result.endCursor;
      hasNext = result.hasNextPage;
    }
    return all;
  }, [permission]);

  const refresh = useCallback(async () => {
    endCursorRef.current = undefined;
    setHasMore(true);
    await loadPage(undefined, true);
  }, [loadPage]);

  // First launch: read the permission state and, if the app has never asked,
  // request photo/video access automatically — no folder picker, like a normal
  // gallery app. Only ever auto-asks once per install.
  useEffect(() => {
    (async () => {
      const res = await MediaLibrary.getPermissionsAsync();
      const status = mapPermission(res);
      setPermission(status);
      if (status === "granted" || status === "limited") return;
      const asked = await AsyncStorage.getItem(PERMISSION_ASKED_KEY).catch(() => null);
      if (asked === "1") return;
      await AsyncStorage.setItem(PERMISSION_ASKED_KEY, "1").catch(() => {});
      if (res?.canAskAgain !== false) {
        await requestPermission();
      }
    })();
  }, [requestPermission]);

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
    AsyncStorage.getItem(HIDDEN_KEY)
      .then((v) => {
        if (!v) return;
        const parsed = JSON.parse(v) as string[];
        if (Array.isArray(parsed)) setHiddenIds(new Set(parsed));
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

  const deletedIds = useMemo(
    () => new Set(deletedItems.map((item) => item.id)),
    [deletedItems],
  );

  const photos = useMemo(
    () =>
      rawPhotos.filter(
        (p) => !deletedIds.has(p.id) && !archivedIds.has(p.id) && !hiddenIds.has(p.id),
      ),
    [rawPhotos, deletedIds, archivedIds, hiddenIds],
  );

  const archivedPhotos = useMemo(
    () =>
      rawPhotos.filter(
        (p) => archivedIds.has(p.id) && !deletedIds.has(p.id) && !hiddenIds.has(p.id),
      ),
    [rawPhotos, archivedIds, deletedIds, hiddenIds],
  );

  const hiddenPhotos = useMemo(
    () => rawPhotos.filter((p) => hiddenIds.has(p.id) && !deletedIds.has(p.id)),
    [rawPhotos, hiddenIds, deletedIds],
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
      await MediaLibrary.deleteAssetsAsync([id]).catch(() => {});
      setRawPhotos((prev) => prev.filter((p) => p.id !== id));
      setHiddenIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(next))).catch(
          () => {},
        );
        return next;
      });
      persistDeletedItems(deletedItems.filter((item) => item.id !== id));
    },
    [deletedItems, persistDeletedItems],
  );

  const deleteForeverBulk = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      await MediaLibrary.deleteAssetsAsync(ids).catch(() => {});
      setRawPhotos((prev) => prev.filter((p) => !idSet.has(p.id)));
      setHiddenIds((prev) => {
        const next = new Set(prev);
        let changed = false;
        for (const id of ids) {
          if (next.delete(id)) changed = true;
        }
        if (changed) {
          AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(next))).catch(
            () => {},
          );
        }
        return next;
      });
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

  const hidePhoto = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  }, []);

  const hidePhotosBulk = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setHiddenIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  }, []);

  const unhidePhoto = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  }, []);

  return useMemo(
    () => ({
      permission,
      photos,
      archivedPhotos,
      hiddenPhotos,
      hiddenIds,
      favoritePhotos,
      favoriteIds,
      deletedItems,
      loading,
      hasMore,
      totalCount: rawPhotos.length,
      requestPermission,
      refreshPermission,
      loadMore,
      loadAllPhotos,
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
      hidePhoto,
      hidePhotosBulk,
      unhidePhoto,
    }),
    [
      permission,
      photos,
      archivedPhotos,
      hiddenPhotos,
      hiddenIds,
      favoritePhotos,
      favoriteIds,
      deletedItems,
      loading,
      hasMore,
      rawPhotos.length,
      requestPermission,
      refreshPermission,
      loadMore,
      loadAllPhotos,
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
      hidePhoto,
      hidePhotosBulk,
      unhidePhoto,
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
