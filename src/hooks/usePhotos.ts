import * as MediaLibrary from 'expo-media-library';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

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

export type PermissionState = 'undetermined' | 'granted' | 'limited' | 'denied';

function mapPermission(res: MediaLibrary.PermissionResponse | null): PermissionState {
  if (!res) return 'undetermined';
  if (res.accessPrivileges === 'limited') return 'limited';
  if (res.status === 'granted') return 'granted';
  if (res.status === 'denied') return 'denied';
  return 'undetermined';
}

export function usePhotos() {
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const endCursorRef = useRef<string | undefined>(undefined);
  const loadingRef = useRef(false);

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

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    if (!hasMore) return;
    if (permission !== 'granted' && permission !== 'limited') return;

    loadingRef.current = true;
    setLoading(true);
    try {
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: ['photo', 'video'],
        first: PAGE_SIZE,
        after: endCursorRef.current,
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
      setPhotos((prev) => (endCursorRef.current ? [...prev, ...mapped] : mapped));
      setTotalCount(result.totalCount);
      endCursorRef.current = result.endCursor;
      setHasMore(result.hasNextPage);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [hasMore, permission]);

  const refresh = useCallback(async () => {
    endCursorRef.current = undefined;
    setHasMore(true);
    setPhotos([]);
    await loadMore();
  }, [loadMore]);

  useEffect(() => {
    refreshPermission();
  }, [refreshPermission]);

  useEffect(() => {
    if (permission === 'granted' || permission === 'limited') {
      refresh();
    }
  }, [permission, refresh]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = MediaLibrary.addListener(() => {
      refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refreshPermission();
    });
    return () => sub.remove();
  }, [refreshPermission]);

  return {
    permission,
    photos,
    loading,
    hasMore,
    totalCount,
    requestPermission,
    refreshPermission,
    loadMore,
    refresh,
  };
}
