import type { Photo } from '../hooks/usePhotos';

export type ZoomLevel = 'years' | 'months' | 'days' | 'all';

export type GridItem =
  | { type: 'header'; id: string; title: string; subtitle?: string }
  | { type: 'photo'; id: string; photo: Photo };

const monthNamesLong = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDay(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function buildGrid(photos: Photo[], zoom: ZoomLevel): GridItem[] {
  if (photos.length === 0) return [];
  if (zoom === 'all') {
    return photos.map((p) => ({ type: 'photo', id: p.id, photo: p }));
  }

  const items: GridItem[] = [];
  let currentKey = '';

  for (const photo of photos) {
    const d = new Date(photo.creationTime);
    let key: string;
    let title: string;
    let subtitle: string | undefined;

    if (zoom === 'years') {
      key = String(d.getFullYear());
      title = key;
    } else if (zoom === 'months') {
      key = `${d.getFullYear()}-${d.getMonth()}`;
      title = monthNamesLong[d.getMonth()];
      subtitle = String(d.getFullYear());
    } else {
      key = d.toDateString();
      title = formatDay(d);
    }

    if (key !== currentKey) {
      currentKey = key;
      items.push({ type: 'header', id: `h:${key}`, title, subtitle });
    }
    items.push({ type: 'photo', id: photo.id, photo });
  }
  return items;
}

export function nextZoom(z: ZoomLevel): ZoomLevel {
  if (z === 'years') return 'months';
  if (z === 'months') return 'days';
  if (z === 'days') return 'all';
  return 'all';
}

export function prevZoom(z: ZoomLevel): ZoomLevel {
  if (z === 'all') return 'days';
  if (z === 'days') return 'months';
  if (z === 'months') return 'years';
  return 'years';
}

export function columnsForZoom(z: ZoomLevel): number {
  if (z === 'years') return 1;
  if (z === 'months') return 2;
  if (z === 'days') return 3;
  return 4;
}
