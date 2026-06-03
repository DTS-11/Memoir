import type { Photo } from "../hooks/usePhotos";

/**
 * Zoom is expressed as the number of columns in the grid, 1..8.
 *
 *   1     →  year-grouped, one giant tile per row
 *   2     →  month-grouped
 *   3,4,5 →  day-grouped (the "Days" feel)
 *   6,7,8 →  ungrouped, dense grid (the "All Photos" feel)
 *
 * Pinching changes the column count by ±1 — so the user gets several discrete
 * tile sizes inside each layout family before the layout itself shifts.
 */
export type ZoomLevel = number;

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
export const DEFAULT_ZOOM = 4;

export type LayoutFamily = "years" | "months" | "days" | "all";

export function familyForZoom(z: ZoomLevel): LayoutFamily {
  if (z <= 1) return "years";
  if (z <= 2) return "months";
  if (z <= 5) return "days";
  return "all";
}

export function zoomForFamily(f: LayoutFamily): ZoomLevel {
  if (f === "years") return 1;
  if (f === "months") return 2;
  if (f === "days") return 4;
  return 7;
}

export type GridItem =
  | { type: "header"; id: string; title: string; subtitle?: string }
  | { type: "photo"; id: string; photo: Photo };

const monthNamesLong = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function formatDay(d: Date) {
  return dayFormatter.format(d);
}

export function buildGrid(photos: Photo[], zoom: ZoomLevel): GridItem[] {
  if (photos.length === 0) return [];
  const family = familyForZoom(zoom);

  if (family === "all") {
    return photos.map((p) => ({ type: "photo", id: p.id, photo: p }));
  }

  const items: GridItem[] = [];
  let currentKey = "";

  for (const photo of photos) {
    const d = new Date(photo.creationTime);
    let key: string;
    let title: string;
    let subtitle: string | undefined;

    if (family === "years") {
      key = String(d.getFullYear());
      title = key;
    } else if (family === "months") {
      key = `${d.getFullYear()}-${d.getMonth()}`;
      title = monthNamesLong[d.getMonth()];
      subtitle = String(d.getFullYear());
    } else {
      // days
      key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      title = formatDay(d);
    }

    if (key !== currentKey) {
      currentKey = key;
      items.push({ type: "header", id: `h:${key}`, title, subtitle });
    }
    items.push({ type: "photo", id: photo.id, photo });
  }
  return items;
}

/** Pinch in (scale > 1) → fewer, larger tiles → decrease column count. */
export function zoomIn(z: ZoomLevel): ZoomLevel {
  return Math.max(MIN_ZOOM, z - 1);
}

/** Pinch out (scale < 1) → more, smaller tiles → increase column count. */
export function zoomOut(z: ZoomLevel): ZoomLevel {
  return Math.min(MAX_ZOOM, z + 1);
}

export function clampZoom(z: ZoomLevel): ZoomLevel {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(z)));
}

export function columnsForZoom(z: ZoomLevel): number {
  return clampZoom(z);
}
