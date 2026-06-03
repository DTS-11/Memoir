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
  surface: "#F5F5F7",
  surfaceElevated: "#FFFFFF",
  glassTint: "rgba(245, 245, 247, 0.72)",
  glassBorder: "rgba(0, 0, 0, 0.06)",
  text: "#0A0A0B",
  textSecondary: "rgba(10, 10, 11, 0.6)",
  textTertiary: "rgba(10, 10, 11, 0.38)",
  accent: "#0A84FF",
  accentMuted: "rgba(10, 132, 255, 0.16)",
  separator: "rgba(60, 60, 67, 0.18)",
  thumbPlaceholder: "#E5E5EA",
  shadow: "rgba(0, 0, 0, 0.18)",
  scrim: "rgba(0, 0, 0, 0.45)",
};

export const darkColors: ThemeColors = {
  background: "#000000",
  surface: "#0E0E10",
  surfaceElevated: "#1C1C1E",
  glassTint: "rgba(28, 28, 30, 0.62)",
  glassBorder: "rgba(255, 255, 255, 0.08)",
  text: "#FFFFFF",
  textSecondary: "rgba(235, 235, 245, 0.6)",
  textTertiary: "rgba(235, 235, 245, 0.3)",
  accent: "#0A84FF",
  accentMuted: "rgba(10, 132, 255, 0.24)",
  separator: "rgba(84, 84, 88, 0.6)",
  thumbPlaceholder: "#1C1C1E",
  shadow: "rgba(0, 0, 0, 0.6)",
  scrim: "rgba(0, 0, 0, 0.65)",
};

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
  largeTitle: { fontSize: 34, fontWeight: "700" as const, letterSpacing: 0.37 },
  title1: { fontSize: 28, fontWeight: "700" as const },
  title2: { fontSize: 22, fontWeight: "700" as const },
  title3: { fontSize: 20, fontWeight: "600" as const },
  headline: { fontSize: 17, fontWeight: "600" as const },
  body: { fontSize: 17, fontWeight: "400" as const },
  callout: { fontSize: 16, fontWeight: "400" as const },
  subhead: { fontSize: 15, fontWeight: "500" as const },
  footnote: { fontSize: 13, fontWeight: "500" as const },
  caption1: { fontSize: 12, fontWeight: "500" as const },
  caption2: { fontSize: 11, fontWeight: "600" as const, letterSpacing: 0.07 },
};
