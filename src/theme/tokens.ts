export type ThemeMode = "light" | "dark";

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceElevated: string;
  glassTint: string;
  glassBorder: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentMuted: string;
  separator: string;
  thumbPlaceholder: string;
  shadow: string;
  scrim: string;
};

export const lightColors: ThemeColors = {
  background: "#FFFFFF",
  surface: "#F5F5F5",
  surfaceElevated: "#FFFFFF",
  glassTint: "rgba(255,255,255,0.82)",
  glassBorder: "rgba(0,0,0,0.09)",
  text: "#080808",
  textSecondary: "rgba(8,8,8,0.54)",
  textTertiary: "rgba(8,8,8,0.30)",
  accent: "#080808",
  accentMuted: "rgba(8,8,8,0.07)",
  separator: "rgba(0,0,0,0.08)",
  thumbPlaceholder: "#E8E8E8",
  shadow: "rgba(0,0,0,0.12)",
  scrim: "rgba(0,0,0,0.45)",
};

export const darkColors: ThemeColors = {
  background: "#000000",
  surface: "#0D0D0D",
  surfaceElevated: "#181818",
  glassTint: "rgba(0,0,0,0.74)",
  glassBorder: "rgba(255,255,255,0.10)",
  text: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.54)",
  textTertiary: "rgba(255,255,255,0.28)",
  accent: "#FFFFFF",
  accentMuted: "rgba(255,255,255,0.10)",
  separator: "rgba(255,255,255,0.08)",
  thumbPlaceholder: "#1C1C1C",
  shadow: "rgba(0,0,0,0.72)",
  scrim: "rgba(0,0,0,0.65)",
};

// Semantic accent colors — constant across both modes.
// Red for destructive, orange for archive, pink for favorites.
export const semantic = {
  delete: "#FF3B30",
  deleteMuted: "rgba(255,59,48,0.14)",
  archive: "#FF9500",
  archiveMuted: "rgba(255,149,0,0.14)",
  favorite: "#FF2D55",
  favoriteMuted: "rgba(255,45,85,0.14)",
} as const;

export const radii = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
};

export const spacing = (n: number) => n * 4;

export const typography = {
  largeTitle: { fontSize: 34, fontWeight: "700" as const, letterSpacing: -0.5 },
  title1: { fontSize: 28, fontWeight: "700" as const, letterSpacing: -0.4 },
  title2: { fontSize: 22, fontWeight: "700" as const, letterSpacing: -0.3 },
  title3: { fontSize: 20, fontWeight: "600" as const, letterSpacing: -0.2 },
  headline: { fontSize: 17, fontWeight: "600" as const },
  body: { fontSize: 17, fontWeight: "400" as const },
  callout: { fontSize: 16, fontWeight: "400" as const },
  subhead: { fontSize: 15, fontWeight: "500" as const },
  footnote: { fontSize: 13, fontWeight: "500" as const },
  caption1: { fontSize: 12, fontWeight: "500" as const },
  caption2: { fontSize: 11, fontWeight: "600" as const, letterSpacing: 0.07 },
};
