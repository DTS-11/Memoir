import type { Photo } from "../hooks/usePhotos";

export type LayoutFamily = "days" | "months" | "years" | "all";

export const FAMILY_COLUMNS: Record<LayoutFamily, number> = {
  days: 4,
  months: 5,
  years: 7,
  all: 8,
};

// Ordered most-zoomed-in → most-zoomed-out
const FAMILY_ORDER: LayoutFamily[] = ["days", "months", "years", "all"];

export const DEFAULT_FAMILY: LayoutFamily = "days";

export function zoomInFamily(f: LayoutFamily): LayoutFamily {
  const i = FAMILY_ORDER.indexOf(f);
  return FAMILY_ORDER[Math.max(0, i - 1)];
}

export function zoomOutFamily(f: LayoutFamily): LayoutFamily {
  const i = FAMILY_ORDER.indexOf(f);
  return FAMILY_ORDER[Math.min(FAMILY_ORDER.length - 1, i + 1)];
}

export function canZoomIn(f: LayoutFamily): boolean {
  return f !== "days";
}

export function canZoomOut(f: LayoutFamily): boolean {
  return f !== "all";
}

export type GridItem =
  | { type: "header"; id: string; title: string; subtitle?: string; count?: number }
  | { type: "photo"; id: string; photo: Photo };

/**
 * Returns the index (in the GridItem[] array) of the first item whose id matches.
 * Used to restore scroll position when switching between layout families, so the
 * month/photo under your fingers stays put during a pinch zoom.
 */
export function gridIndexForPhoto(items: GridItem[], photoId: string): number {
  for (let i = 0; i < items.length; i++) {
    if (items[i].type === "photo" && items[i].id === photoId) return i;
  }
  return -1;
}

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

// Approximate height of a section header row (paddingTop + text + paddingBottom)
export const HEADER_H = 54;

/**
 * Returns approximate scroll-Y for each section header so the fast scrollbar
 * can snap to month/year boundaries and show a date label while dragging.
 * Values are estimates — headers have slightly variable height — but close enough.
 */
/**
 * Given an absolute touch position and the current scroll offset, returns
 * the index into the `photos` array (headers excluded) that the finger is over.
 * Used for long-press drag-to-select on the photo grid.
 */
export function photoIndexFromTouch(
  absX: number,
  absY: number,
  scrollY: number,
  items: GridItem[],
  tileSize: number,
  columns: number,
  contentTopPadding: number,
): number {
  const col = Math.max(0, Math.min(columns - 1, Math.floor(absX / tileSize)));
  const contentY = absY + scrollY - contentTopPadding;
  if (contentY < 0) return 0;

  let y = 0;
  let photoIdx = 0;
  let i = 0;

  while (i < items.length) {
    const item = items[i];
    if (item.type === "header") {
      if (contentY < y + HEADER_H) return photoIdx;
      y += HEADER_H;
      i++;
    } else {
      let count = 0;
      while (i + count < items.length && items[i + count].type === "photo") count++;
      const rowHeight = Math.ceil(count / columns) * tileSize;
      if (contentY < y + rowHeight) {
        const row = Math.floor((contentY - y) / tileSize);
        return photoIdx + Math.min(row * columns + col, count - 1);
      }
      y += rowHeight;
      photoIdx += count;
      i += count;
    }
  }
  return Math.max(0, photoIdx - 1);
}

export function computeSectionOffsets(
  items: GridItem[],
  columns: number,
  tileSize: number,
  topPadding: number,
): Array<{ title: string; subtitle?: string; y: number }> {
  const result: Array<{ title: string; subtitle?: string; y: number }> = [];
  let y = topPadding;
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    if (item.type === "header") {
      result.push({ title: item.title, subtitle: item.subtitle, y });
      y += HEADER_H;
      i++;
    } else {
      let count = 0;
      while (i < items.length && items[i].type === "photo") {
        count++;
        i++;
      }
      y += Math.ceil(count / columns) * tileSize;
    }
  }
  return result;
}

export function buildGrid(photos: Photo[], family: LayoutFamily): GridItem[] {
  if (photos.length === 0) return [];

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
      key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      title = dayFormatter.format(d);
    }

    if (key !== currentKey) {
      currentKey = key;
      items.push({ type: "header", id: `h:${key}`, title, subtitle });
    }
    // Headers are always followed by at least one photo; each photo in the same
    // group bumps the count on the header that started the group.
    const header = items[items.length - 1];
    if (header.type === "header") {
      header.count = (header.count ?? 0) + 1;
    }
    items.push({ type: "photo", id: photo.id, photo });
  }
  return items;
}
