import { Ionicons } from '@expo/vector-icons';

export type TabIconName = 'library' | 'sparkles' | 'albums' | 'search';

const map: Record<TabIconName, keyof typeof Ionicons.glyphMap> = {
  library: 'images',
  sparkles: 'sparkles',
  albums: 'albums',
  search: 'search',
};

export function TabIcon({
  name,
  color,
  size = 22,
}: {
  name: TabIconName;
  color: string;
  size?: number;
}) {
  return <Ionicons name={map[name]} color={color} size={size} />;
}
