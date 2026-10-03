import * as MediaLibrary from "expo-media-library/legacy";
import { useCallback, useEffect, useState } from "react";

export type AlbumPreview = {
  id: string;
  title: string;
  count: number;
  coverUri?: string;
  type: "user" | "smart";
};

async function previewForAlbum(album: MediaLibrary.Album): Promise<AlbumPreview> {
  let coverUri: string | undefined;
  try {
    const assets = await MediaLibrary.getAssetsAsync({
      album: album.id,
      first: 1,
      mediaType: ["photo", "video"],
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    });
    coverUri = assets.assets[0]?.uri;
  } catch {}
  return {
    id: album.id,
    title: album.title,
    count: album.assetCount,
    coverUri,
    type: "user",
  };
}

async function smartAlbumByMediaSubtype(
  title: string,
  match: (a: MediaLibrary.Asset) => boolean,
): Promise<AlbumPreview | null> {
  try {
    // Use first: 0 to get totalCount without fetching all assets
    const res = await MediaLibrary.getAssetsAsync({
      mediaType: ["photo", "video"],
      first: 1,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    });
    const totalAssets = res.totalCount;
    if (totalAssets === 0) return null;

    // Page through assets to apply the custom match function
    const matched: MediaLibrary.Asset[] = [];
    let after: string | undefined;
    for (let pages = 0; pages < 20; pages++) {
      const page = await MediaLibrary.getAssetsAsync({
        mediaType: ["photo", "video"],
        first: 500,
        after,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      for (const a of page.assets) {
        if (match(a)) matched.push(a);
      }
      if (!page.hasNextPage) break;
      after = page.endCursor;
    }
    if (matched.length === 0) return null;
    return {
      id: `smart:${title}`,
      title,
      count: matched.length,
      coverUri: matched[0].uri,
      type: "smart",
    };
  } catch {
    return null;
  }
}

export function useAlbums(enabled: boolean) {
  const [albums, setAlbums] = useState<AlbumPreview[]>([]);
  const [smart, setSmart] = useState<AlbumPreview[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const rawAlbums = await MediaLibrary.getAlbumsAsync({
        includeSmartAlbums: false,
      });
      const previews = await Promise.all(rawAlbums.map(previewForAlbum));
      setAlbums(previews.filter((a) => a.count > 0));

      const [videos, recents] = await Promise.all([
        smartAlbumByMediaSubtype("Videos", (a) => a.mediaType === "video"),
        smartAlbumByMediaSubtype(
          "Recents",
          (a) => a.creationTime > Date.now() - 30 * 24 * 60 * 60 * 1000,
        ),
      ]);
      setSmart([recents, videos].filter(Boolean) as AlbumPreview[]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const createAlbum = useCallback(async (title: string, assetIds: string[]) => {
    if (assetIds.length === 0) return null;
    try {
      const asset = await MediaLibrary.getAssetInfoAsync(assetIds[0]);
      if (asset) {
        const album = await MediaLibrary.createAlbumAsync(title, asset, false);
        if (assetIds.length > 1) {
          await MediaLibrary.addAssetsToAlbumAsync(assetIds.slice(1), album, false);
        }
        await load();
        return album;
      }
    } catch {}
    return null;
  }, [load]);

  const addToAlbum = useCallback(async (albumId: string, assetIds: string[]) => {
    try {
      // Find the actual MediaLibrary.Album object first
      const rawAlbums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: false });
      const album = rawAlbums.find(a => a.id === albumId);
      if (album) {
        await MediaLibrary.addAssetsToAlbumAsync(assetIds, album, false);
        await load();
      }
    } catch {}
  }, [load]);

  return { albums, smart, loading, reload: load, createAlbum, addToAlbum };
}
