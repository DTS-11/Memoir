import { Ionicons } from '@expo/vector-icons';
import type { Photo } from '../hooks/usePhotos';

export type Category = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  match: (p: Photo) => boolean;
};

export const categories: Category[] = [
  {
    key: 'recent',
    label: 'Recently Added',
    icon: 'time-outline',
    match: () => true,
  },
  {
    key: 'video',
    label: 'Videos',
    icon: 'videocam-outline',
    match: (p) => p.mediaType === 'video',
  },
  {
    key: 'live',
    label: 'Live Photos',
    icon: 'radio-outline',
    match: (p) => p.duration > 0 && p.duration < 4 && p.mediaType === 'photo',
  },
  {
    key: 'screenshot',
    label: 'Screenshots',
    icon: 'phone-portrait-outline',
    match: (p) => /screenshot/i.test(p.filename),
  },
  {
    key: 'pano',
    label: 'Panoramas',
    icon: 'scan-outline',
    match: (p) => p.width / Math.max(1, p.height) > 2,
  },
  {
    key: 'selfie',
    label: 'Selfies',
    icon: 'person-circle-outline',
    match: (p) => /selfie|front/i.test(p.filename),
  },
];

export function getCategory(key: string): Category | undefined {
  return categories.find((c) => c.key === key);
}
