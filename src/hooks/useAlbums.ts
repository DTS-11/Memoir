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
    const res = await MediaLibrary.getAssetsAsync({
      mediaType: ["photo", "video"],
      first: 500,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    });
    const filtered = res.assets.filter(match);
    if (filtered.length === 0) return null;
    return {
      id: `smart:${title}`,
      title,
      count: filtered.length,
      coverUri: filtered[0].uri,
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
        smartAlbumByMediaSubtype("Recents", () => true),
      ]);
      setSmart([recents, videos].filter(Boolean) as AlbumPreview[]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { albums, smart, loading, reload: load };
}
