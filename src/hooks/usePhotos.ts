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
  const [deletedItems, setDeletedItems] = useState<RecentlyDeletedPhoto[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const endCursorRef = useRef<string | undefined>(undefined);
  const loadingRef = useRef(false);

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
      if (loadingRef.current) return;
      if (permission !== "granted" && permission !== "limited") return;
      loadingRef.current = true;
      setLoading(true);
      try {
        const result = await MediaLibrary.getAssetsAsync({
          mediaType: ["photo", "video"],
          first: PAGE_SIZE,
          after,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        });
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
        loadingRef.current = false;
        setLoading(false);
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
      if (s === "active") refreshPermission();
    });
    return () => sub.remove();
  }, [refreshPermission]);

  // ── derived lists ───────────────────────────────────────────────────────────

  const deletedIds = useMemo(
    () => new Set(deletedItems.map((item) => item.id)),
    [deletedItems],
  );

  const photos = useMemo(
    () =>
      rawPhotos.filter((p) => !deletedIds.has(p.id) && !archivedIds.has(p.id)),
    [rawPhotos, deletedIds, archivedIds],
  );

  const archivedPhotos = useMemo(
    () =>
      rawPhotos.filter((p) => archivedIds.has(p.id) && !deletedIds.has(p.id)),
    [rawPhotos, archivedIds, deletedIds],
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
      totalCount,
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
