import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const RELEASES_URL = "https://api.github.com/repos/DTS-11/Memoir/releases/latest";
const DISMISS_KEY = "memoir:update-dismissed-version";
const LAST_CHECK_KEY = "memoir:update-last-check";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export type UpdateInfo = {
  latestVersion: string;
  releaseName: string | null;
  releaseUrl: string;
  apkUrl: string | null;
  body: string | null;
};

function parseSemver(v: string): number[] {
  return v
    .replace(/^v/i, "")
    .split(/[\.\-]/)
    .map((part) => {
      const n = parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

function isNewer(latest: string, current: string): boolean {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const an = a[i] ?? 0;
    const bn = b[i] ?? 0;
    if (an > bn) return true;
    if (an < bn) return false;
  }
  return false;
}

type GitHubAsset = { name: string; browser_download_url: string };
type GitHubRelease = {
  tag_name: string;
  name: string | null;
  html_url: string;
  body: string | null;
  assets: GitHubAsset[];
  draft: boolean;
  prerelease: boolean;
};

/**
 * Polls GitHub releases for a newer version than the running build. Returns
 * the update info only if:
 *   - A newer non-draft, non-prerelease release exists,
 *   - AND the user has not already dismissed this exact version.
 *
 * Fails silently on any error (offline, rate-limited, etc.) — the app must
 * never block on update checks.
 */
export function useAppUpdate() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    let cancelled = false;

    (async () => {
      try {
        const currentVersion = Constants.expoConfig?.version;
        if (!currentVersion) return;

        // Throttle network checks across cold starts.
        const lastCheckRaw = await AsyncStorage.getItem(LAST_CHECK_KEY);
        const lastCheck = lastCheckRaw ? parseInt(lastCheckRaw, 10) : 0;
        if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(RELEASES_URL, {
          headers: { Accept: "application/vnd.github+json" },
          signal: controller.signal,
        }).catch(() => null);
        clearTimeout(timeout);
        if (!res || !res.ok) return;

        const data = (await res.json()) as GitHubRelease;
        await AsyncStorage.setItem(LAST_CHECK_KEY, String(Date.now()));

        if (data.draft || data.prerelease) return;
        if (!data.tag_name) return;

        const latest = data.tag_name.replace(/^v/i, "");
        if (!isNewer(latest, currentVersion)) return;

        const dismissed = await AsyncStorage.getItem(DISMISS_KEY);
        if (dismissed === latest) return;

        const apk = data.assets.find((a) => a.name.toLowerCase().endsWith(".apk"));

        if (cancelled) return;
        setUpdate({
          latestVersion: latest,
          releaseName: data.name,
          releaseUrl: data.html_url,
          apkUrl: apk?.browser_download_url ?? null,
          body: data.body,
        });
      } catch {
        // swallow — never block UX on update check
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = async () => {
    if (!update) return;
    await AsyncStorage.setItem(DISMISS_KEY, update.latestVersion);
    setUpdate(null);
  };

  return { update, dismiss };
}
