# Memoir

A fast, mobile-first Apple Photos-style gallery built with Expo + React Native + Bun.

## Stack
- Expo SDK 56, React Native 0.85, React 19, TypeScript
- expo-router (file-based routing)
- Reanimated 4 + react-native-gesture-handler (pinch zoom, swipe-to-dismiss, dock animation)
- @shopify/flash-list (virtualised photo grid)
- expo-image (fast image rendering with disk + memory cache)
- expo-blur (glass theme)
- expo-media-library (photo permissions + library access)
- expo-haptics, @expo/vector-icons

## Run

```bash
bun install
bun run ios       # iOS simulator (Mac required)
bun run android   # Android emulator/device
bun run start     # Pick a target from the Expo dev menu
```

> First run on a physical device or simulator will prompt for photo-library
> access. Memoir works in `limited` mode (iOS) as well as `granted`.

## Features
- **Library tab** with Years / Months / Days / All Photos zoom levels (tap segmented control or pinch to change zoom).
- **For You tab** with auto-generated monthly Memories and Featured Photos rail.
- **Albums tab** with user albums + Recents/Videos smart groupings.
- **Search tab** with text search across filenames/dates and category drilldown (Videos, Live Photos, Screenshots, Panoramas, Selfies).
- **Photo viewer** with pinch-zoom, double-tap zoom, pan, swipe-to-dismiss, and glass top/bottom chrome.
- **Dock navigation** — custom glass blur tab bar with animated indicator and haptics.
- **Auto light/dark** following the OS appearance.

## Project layout
```
app/
  _layout.tsx             # Root: theme, gesture root, status bar, stack
  permission.tsx          # Permission prompt (modal)
  photo/[id].tsx          # Full-screen photo viewer
  (tabs)/
    _layout.tsx           # Glass dock tabs
    index.tsx             # Library
    for-you.tsx           # For You
    albums.tsx            # Albums
    search.tsx            # Search
src/
  theme/                  # Tokens + ThemeProvider
  components/             # Dock, GlassView, PhotoGrid, PhotoThumb, etc.
  hooks/                  # usePhotos, useAlbums
  utils/                  # grouping (year/month/day buckets)
```
