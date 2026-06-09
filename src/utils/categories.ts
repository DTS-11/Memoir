import { Ionicons } from "@expo/vector-icons";
import type { Photo } from "../hooks/usePhotos";

export type Category = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  match: (p: Photo) => boolean;
};

export const categories: Category[] = [
  {
    key: "recent",
    label: "Recently Added",
    icon: "time-outline",
    match: (p) => p.creationTime > Date.now() - 30 * 24 * 60 * 60 * 1000,
  },
  {
    key: "video",
    label: "Videos",
    icon: "videocam-outline",
    match: (p) => p.mediaType === "video",
  },
  {
    key: "screenshot",
    label: "Screenshots",
    icon: "phone-portrait-outline",
    match: (p) => /screenshot/i.test(p.filename),
  },
  {
    key: "selfie",
    label: "Selfies",
    icon: "person-circle-outline",
    match: (p) => /selfie|front.?cam/i.test(p.filename),
  },
  {
    key: "live",
    label: "Live Photos",
    icon: "radio-outline",
    match: (p) => p.duration > 0 && p.duration < 4 && p.mediaType === "photo",
  },
  {
    key: "pano",
    label: "Panoramas",
    icon: "scan-outline",
    match: (p) => p.width > 0 && p.width / Math.max(1, p.height) > 2,
  },
  {
    key: "gif",
    label: "GIFs",
    icon: "images-outline",
    match: (p) => /\.gif$/i.test(p.filename),
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    icon: "chatbubble-ellipses-outline",
    match: (p) => /[-_]WA\d+\./i.test(p.filename),
  },
  {
    key: "audio",
    label: "Audio",
    icon: "musical-notes-outline",
    match: (p) => p.mediaType === "audio",
  },
  {
    key: "raw",
    label: "RAW Photos",
    icon: "aperture-outline",
    match: (p) => /\.(dng|raw|arw|cr2|nef|orf|rw2|raf|3fr|iiq)$/i.test(p.filename),
  },
];

export function getCategory(key: string): Category | undefined {
  return categories.find((c) => c.key === key);
}
