<div align="center">

<img src="assets/AppIcons/appstore.png" alt="Memoir app icon" width="128" height="128" />

# Memoir

**A fast, mobile-first photo gallery inspired by Apple Photos — built with Expo and React Native.**

[![Expo SDK](https://img.shields.io/badge/Expo-SDK%2056-000020?logo=expo&logoColor=white)](https://docs.expo.dev/versions/v56.0.0/)
[![React Native](https://img.shields.io/badge/React%20Native-0.85-61DAFB?logo=react&logoColor=white)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.2-FBF0DF?logo=bun&logoColor=black)](https://bun.sh/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

---

## About

Memoir reimagines the local photo gallery as a clean, gesture-driven mobile app. It reads photos directly from the device's library, groups them by Years / Months / Days, and presents them through a glass-blur dock and a full-screen viewer that feels native on both iOS and Android. There is no cloud, no account, and nothing leaves your device.

## Features

- **Library zoom levels** — pinch in and out of Years, Months, Days, and All Photos. The grid restructures with each level, just like Apple Photos.
- **Glass dock navigation** — a custom blur-backed bottom dock with an animated focus indicator and haptic feedback on every switch.
- **Full-screen viewer** — pinch zoom, double-tap zoom, two-finger pan, and swipe-to-dismiss with chrome that auto-hides on tap.
- **For You** — auto-generated monthly Memories and a Featured Photos rail built from the most recent shots.
- **Albums** — your user albums plus smart Recents and Videos groupings, all pulled live from the device.
- **Search** — match on filename and date, or drill into categories like Videos, Live Photos, Screenshots, Panoramas, and Selfies.
- **Light and dark themes** — automatically follows the system appearance with a hand-tuned token palette.
- **Permission-aware** — graceful prompts and gating UI for granted, limited (iOS), denied, and undetermined states.
- **Performance first** — `FlashList` for virtualised scroll, `expo-image` with memory + disk cache, and paginated library reads.
- **Local only** — no servers, no telemetry, no uploads.

## Tech Stack

| Area | Choice |
| --- | --- |
| Runtime | Expo SDK 56, React Native 0.85, React 19, TypeScript |
| Routing | `expo-router` (file-based, typed routes) |
| Animation & gestures | `react-native-reanimated` 4, `react-native-gesture-handler`, `react-native-worklets` |
| Lists & images | `@shopify/flash-list`, `expo-image` |
| UI primitives | `expo-blur`, `expo-haptics`, `@expo/vector-icons` |
| Media access | `expo-media-library` |
| Package manager | [Bun](https://bun.sh) |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) `>= 1.2`
- iOS Simulator (macOS) or an Android emulator / physical device
- The [Expo Go](https://expo.dev/client) app if you want to skip a local native build

### Install

```bash
git clone https://github.com/DTS-11/Memoir.git
cd Memoir
bun install
```

### Run

```bash
bun run ios       # iOS Simulator (macOS only)
bun run android   # Android emulator or connected device
bun run start     # Choose a target from the Expo dev menu
```

On first launch, Memoir will ask for photo-library access. It works equally well in iOS' `limited` mode if you only want to share a subset.

## Project Layout

```
app/                          # expo-router screens
  _layout.tsx                 # Root stack, theme + gesture providers
  permission.tsx              # Photo-access prompt (modal)
  photo/[id].tsx              # Full-screen photo viewer
  (tabs)/
    _layout.tsx               # Glass dock tab bar
    index.tsx                 # Library
    for-you.tsx               # For You
    albums.tsx                # Albums
    search.tsx                # Search

src/
  theme/                      # Color tokens + ThemeProvider (light/dark)
  components/                 # Dock, GlassView, PhotoGrid, SegmentedControl, ...
  hooks/                      # usePhotos, useAlbums
  utils/                      # grouping (year / month / day bucket builder)

assets/
  AppIcons/                   # Generated iOS, Android, and Play Store icons
```

## Permissions

- **iOS** — `NSPhotoLibraryUsageDescription` is set in `app.json`. Memoir supports the system "Selected Photos" mode.
- **Android** — declares `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, and the legacy `READ_EXTERNAL_STORAGE`. Adaptive icons are wired through the `expo.android` config.

## Installing Memoir on Android

Releases live at [github.com/DTS-11/Memoir/releases](https://github.com/DTS-11/Memoir/releases). Each release attaches a signed `memoir-<version>.apk` you can install directly.

Step by step on the device:

1. Download `memoir-<version>.apk` from the latest release.
2. Open the file. The first sideload triggers **"For your security, your phone can't install apps from this source"** — tap **Settings**, enable **Allow from this source** for the app that downloaded the APK (Chrome, Firefox, Files), then back out and tap the APK again.
3. **Google Play Protect** will show **"App not recognised"** — this is expected for any app installed outside the Play Store. Tap **Install anyway** (sometimes hidden behind **More details**).
4. Launch Memoir and grant photo access when prompted. Both **"Allow all photos"** and **"Allow selected photos"** modes are supported.

Memoir requires Android 7.0 (API 24) or newer. Every future release uses the same signing key, so updates install in place without uninstalling first.

## Releasing an Android build

The workflow at `.github/workflows/release.yml` runs on every `v*` tag push (or manually via the Actions tab) and publishes a single signed `memoir-<version>.apk` to GitHub Releases. APKs are signed with V1 + V2 + V3 signature schemes via Android Gradle Plugin's defaults.

### One-time keystore setup

You only need to do this once. **The same keystore must be reused for every future release** so that users can upgrade in place without uninstalling.

A helper script generates a PKCS12 keystore and uploads the four GitHub Secrets the workflow expects. Pick the version that matches your shell:

**Windows (PowerShell)** — uses built-in `New-SelfSignedCertificate`, no JDK or openssl install required:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-release-keystore.ps1
```

**macOS / Linux / Git Bash** — uses `openssl`:

```bash
bash scripts/setup-release-keystore.sh
```

Either script will:

1. Prompt for a keystore password.
2. Generate `memoir-release.p12` in the repo root (gitignored).
3. Either upload all four secrets via `gh secret set` (if [GitHub CLI](https://cli.github.com/) is authenticated), or write `github-secrets-to-upload.txt` with paste-ready values for the GitHub web UI.

The four secrets that need to exist on the repo:

| Secret name | Description |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded contents of `memoir-release.p12`. |
| `ANDROID_KEYSTORE_PASSWORD` | The password you chose when generating the keystore. |
| `ANDROID_KEY_ALIAS` | `memoir` (the script sets this for you). |
| `ANDROID_KEY_PASSWORD` | Same value as `ANDROID_KEYSTORE_PASSWORD` for PKCS12 stores. |

> **Back up `memoir-release.p12` and the password** to a password manager immediately. If you lose either, you can never publish an update that installs on top of an existing copy of Memoir — users would have to uninstall first.

### Cutting a release

```bash
# Bump expo.version in app.json + the version in package.json, then commit.
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions will:

1. Install JS dependencies with Bun.
2. Run `expo prebuild --platform android` to materialise the native Android project (the launcher icon and splash come straight from `assets/AppIcons/`).
3. Decode the keystore from `ANDROID_KEYSTORE_BASE64` into `android/app/release.keystore`.
4. Patch `android/app/build.gradle` to add a `release` signing config (see `scripts/patch-android-signing.mjs`).
5. Build a signed release APK with `./gradlew assembleRelease`.
6. Attach `memoir-<version>.apk` to a new GitHub Release with the install instructions above prefilled in the body.

If any secret is missing, the workflow fails at the **Validate required secrets** step before doing any work.

---

## Contributing

Contributions, bug reports, and design feedback are all welcome. Memoir is intentionally small, so it is a friendly place for first-time contributors to land a real-world React Native change.

### Ground rules

1. **Be kind.** This project follows the spirit of the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Disrespectful behavior will not be tolerated.
2. **Keep it local-first.** Memoir never uploads photos or telemetry. Pull requests that introduce remote calls, analytics, or third-party trackers will be declined.
3. **Stay aligned with the design language.** Glass, restraint, and platform-native gestures over heavy chrome.

### Reporting issues

Please open a [GitHub issue](https://github.com/DTS-11/Memoir/issues/new) and include:

- A clear description of the bug or proposal
- Steps to reproduce (if it is a bug)
- Device, OS version, and Expo SDK output from `bunx expo-doctor` when relevant
- Screenshots or short screen recordings when the issue is visual

### Submitting a pull request

1. **Fork** the repository and create a branch off `main`:
   ```bash
   git checkout -b feat/short-descriptive-name
   ```
2. **Install dependencies** with `bun install`.
3. **Make your change.** Keep PRs focused — one feature or fix per branch.
4. **Verify** the project still typechecks and the bundler still builds:
   ```bash
   bunx tsc --noEmit
   bunx expo export --platform web --output-dir .web-test --no-bytecode
   rm -rf .web-test
   ```
5. **Test on a real platform** (iOS Simulator, Android emulator, or a physical device). UI changes should be accompanied by a screenshot or short clip in the PR description.
6. **Commit** with a clear, imperative message — for example, `Add long-press multi-select to grid`. Squash trivial fixups before opening the PR.
7. **Open the pull request** against `main` and fill out the description. Link any issues it closes with `Closes #123`.

### Coding conventions

- TypeScript strict mode — no `any` unless explicitly justified.
- Components live under `src/components/`; screens live under `app/`.
- Theme values come from `src/theme/tokens.ts` — do not hardcode colors or spacing.
- Animations belong in `react-native-reanimated`. Worklets imported from `react-native-worklets` (Reanimated 4 split).
- Prefer composition over new top-level dependencies. If a new dependency is needed, mention it and the size impact in the PR description.

### Areas that need help

- More smart albums (Live Photos detection across platforms, People, Places)
- Long-press multi-select with batch share / delete
- Real shared-element transition between grid and viewer
- Accessibility pass (screen-reader labels, larger text support, reduce-motion)
- iPad / large-screen layouts

## License

Released under the [MIT License](LICENSE) — Copyright © 2026 Deon.
