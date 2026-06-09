import * as MediaLibrary from "expo-media-library/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { categories } from "../utils/categories";
import type { Photo } from "./usePhotos";

const COUNTS_CACHE_KEY = "memoir.categoryCounts.v1";
const SCAN_PAGE = 500;

// Categories whose counts can be derived cheaply from a MediaLibrary query
// without scanning all assets individually.
const ML_QUERYABLE: Record<string, () => Promise<number>> = {
  video: () =>
    MediaLibrary.getAssetsAsync({ mediaType: ["video"], first: 1 })
      .then((r) => r.totalCount)
      .catch(() => 0),
  audio: () =>
    MediaLibrary.getAssetsAsync({ mediaType: ["audio"], first: 1 })
      .then((r) => r.totalCount)
      .catch(() => 0),
  recent: () =>
    MediaLibrary.getAssetsAsync({
      mediaType: ["photo", "video", "audio", "unknown"],
      first: 1,
      createdAfter: Date.now() - 30 * 24 * 60 * 60 * 1000,
    })
      .then((r) => r.totalCount)
      .catch(() => 0),
};

interface Cache {
  counts: Record<string, number>;
  totalCount: number;
  ts: number;
}

// Full scan: page through all assets and run each non-ML-queryable category
// match function. Returns a partial counts object (only scanned categories).
async function scanAllAssets(): Promise<{
  counts: Record<string, number>;
  totalCount: number;
}> {
  const scanCategories = categories.filter((c) => !(c.key in ML_QUERYABLE));
  const counts: Record<string, number> = {};
  for (const c of scanCategories) counts[c.key] = 0;

  let after: string | undefined;
  let totalCount = 0;

  while (true) {
    const res = await MediaLibrary.getAssetsAsync({
      mediaType: ["photo", "video", "audio", "unknown"],
      first: SCAN_PAGE,
      after,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    });

    if (after === undefined) totalCount = res.totalCount;

    for (const asset of res.assets) {
      for (const cat of scanCategories) {
        if (cat.match(asset as unknown as Photo)) {
          counts[cat.key]++;
        }
      }
    }

    if (!res.hasNextPage) break;
    after = res.endCursor;
  }

  return { counts, totalCount };
}

export function useMediaCounts(enabled: boolean): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!enabled) return;

    async function run() {
      // Load cached counts immediately so the UI isn't blank while scanning.
      const raw = await AsyncStorage.getItem(COUNTS_CACHE_KEY).catch(() => null);
      const cache: Cache | null = raw ? JSON.parse(raw) : null;
      if (cache) setCounts(cache.counts);

      // Cheap check: how many total assets are there right now?
      const headRes = await MediaLibrary.getAssetsAsync({ first: 1 }).catch(() => null);
      const currentTotal = headRes?.totalCount ?? 0;

      // If the cache is fresh (< 1 h) and total count unchanged, we're done.
      const cacheAge = Date.now() - (cache?.ts ?? 0);
      if (cache && cache.totalCount === currentTotal && cacheAge < 60 * 60 * 1000) {
        return;
      }

      // Get cheap ML-queryable counts first — emit them straight away.
      const mlEntries = await Promise.all(
        Object.entries(ML_QUERYABLE).map(async ([key, query]) => [key, await query()]),
      );
      const mlCounts = Object.fromEntries(mlEntries) as Record<string, number>;
      setCounts((prev) => ({ ...prev, ...mlCounts }));

      // Full scan for filename/dimension-based categories.
      const { counts: scanned, totalCount } = await scanAllAssets();
      const merged = { ...mlCounts, ...scanned };
      setCounts(merged);

      await AsyncStorage.setItem(
        COUNTS_CACHE_KEY,
        JSON.stringify({
          counts: merged,
          totalCount,
          ts: Date.now(),
        } satisfies Cache),
      ).catch(() => {});
    }

    run().catch(() => {});
  }, [enabled]);

  return counts;
}
