<div align="center">

<img src="assets/memoir_logo.png" alt="Memoir app icon" width="128" height="128" />

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

Memoir reimagines the local photo gallery as a clean, gesture-driven mobile app. It reads media directly from the device's library — photos, videos, audio, and more — groups them by Years / Months / Days, and presents them through a glass-blur dock and a full-screen viewer that feels native on both iOS and Android. There is no cloud, no account, and nothing leaves your device.

## Features

- **Library zoom levels** — pinch in and out of Years, Months, Days, and All Photos. The grid restructures with each level, just like Apple Photos.
- **Glass pill dock** — a compact two-icon frosted-glass dock centered at the bottom, with an animated focus indicator and haptic feedback.
- **Full-screen viewer** — pinch zoom, double-tap zoom, two-finger pan, swipe-to-dismiss, and a scrubber for video and audio playback.
- **Browse screen** — on-device People grouping, monthly Memories carousel, user Albums in a 3-column grid, semantic Utilities (Favorites / Archive / Recently Deleted / Hidden), Categories drill-down, and media/date filter chips — all behind a floating search bar.
- **Favorites** — heart any photo from the viewer or grid; view them in a dedicated screen.
- **Archive** — hide photos from the main library; restore or permanently delete from the Archive screen.
- **Recently Deleted** — a 30-day soft-delete buffer before anything is permanently removed.
- **People** — on-device face detection groups the people in your library into named collections, each with its own photo grid. Rename anyone directly from their page, or browse everyone on the All-People grid.
- **Hidden** — move private photos into a biometric-locked album (Face ID / fingerprint) that stays out of the main library.
- **All file types** — photos, videos, audio, and unknown file types are all surfaced. Audio files play through the full-screen viewer with the same scrubber controls.
- **Monochromatic theme** — black-and-white palette with semantic accents: red for delete, orange for archive, pink for favorites. Automatically follows system light/dark appearance.
- **Sharing** — share any photo or video from the viewer or library grid using the native share sheet.
- **Permission-aware** — graceful prompts and gating UI for granted, limited (iOS), denied, and undetermined states.
- **Performance first** — `FlashList` for the library grid, `expo-image` with memory + disk cache, paginated library reads, and memoized sub-components throughout.
- **Local only** — no servers, no telemetry, no uploads. Your photos never leave your device.

## Installing Memoir on Android

Releases live at [github.com/DTS-11/Memoir/releases](https://github.com/DTS-11/Memoir/releases). Each release attaches a signed `memoir-<version>.apk` you can install directly.

1. **Download** `memoir-<version>.apk` from the Assets section of the latest release.
2. **Open** the downloaded file. The first sideload triggers **"For your security, your phone can't install apps from this source"** — tap **Settings**, enable **Allow from this source** for the app that downloaded the APK (Chrome, Firefox, Files), then go back and tap the APK again.
3. **Google Play Protect** will show **"App not recognised"** — this is expected for any app installed outside the Play Store. Tap **Install anyway** (sometimes hidden behind **More details**).
4. **Launch Memoir** and grant photo access when prompted. Both **"Allow all photos"** and **"Allow selected photos"** modes are supported.

Memoir requires Android 7.0 (API 24) or newer. Every release uses the same signing key, so updates install in place without uninstalling first.

### Why the security warnings?

Memoir is signed with a stable release key (V1 + V2 + V3 signing schemes). The "unknown source" and Play Protect warnings appear because the APK isn't distributed through the Play Store — not because anything is wrong with the app.

### Privacy

Memoir is a local-only gallery. No photos, accounts, telemetry, or analytics ever leave your device.

---

## For Developers

### Permissions

- **iOS** — `NSPhotoLibraryUsageDescription` is set in `app.json`. Memoir supports the system "Selected Photos" mode.
- **Android** — declares `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO`, `READ_MEDIA_VISUAL_USER_SELECTED`, and `ACCESS_MEDIA_LOCATION` for the gallery, plus `USE_BIOMETRIC` / `USE_FINGERPRINT` for the Hidden album.

### Tech Stack

| Area | Choice |
| --- | --- |
| Runtime | Expo SDK 56, React Native 0.85, React 19, TypeScript |
| Routing | `expo-router` (file-based, typed routes) |
| Animation & gestures | `react-native-reanimated` 4, `react-native-gesture-handler`, `react-native-worklets` |
| Lists & images | `@shopify/flash-list`, `expo-image` |
| Media access | `expo-media-library` (legacy API) |
| Face detection & grouping | `@react-native-ml-kit/face-detection` (Google ML Kit) + a JS face fingerprint clustered with `density-clustering` |
| Local storage | `expo-sqlite`, `@react-native-async-storage/async-storage`, `expo-file-system` |
| Image processing | `expo-image-manipulator`, `jpeg-js` |
| Playback | `expo-video` (handles both video and audio) |
| Sharing | `expo-sharing` |
| UI primitives | `expo-glass-effect`, `expo-blur`, `expo-haptics`, `expo-linear-gradient`, `@expo/vector-icons` |
| Package manager | [Bun](https://bun.sh) |

### Getting Started

**Prerequisites**

- [Bun](https://bun.sh) `>= 1.2`
- iOS Simulator (macOS) or an Android emulator / physical device
- The [Expo Go](https://expo.dev/client) app if you want to skip a local native build

**Install**

```bash
git clone https://github.com/DTS-11/Memoir.git
cd Memoir
bun install
```

**Run**

```bash
bun run ios       # iOS Simulator (macOS only)
bun run android   # Android emulator or connected device
bun run start     # Choose a target from the Expo dev menu
```

On first launch, Memoir will ask for photo-library access. It works equally well in iOS' `limited` mode if you only want to share a subset.

### Releasing an Android build

The workflow at `.github/workflows/release.yml` runs on every `v*` tag push (or manually via the Actions tab) and publishes a signed `memoir-<version>.apk` to GitHub Releases.

**One-time keystore setup**

You only need to do this once. The same keystore must be reused for every future release so that users can upgrade in place without uninstalling.

A helper script generates a PKCS12 keystore and uploads the four GitHub Secrets the workflow expects:

**Windows (PowerShell)** — uses built-in `New-SelfSignedCertificate`, no JDK or openssl required:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-release-keystore.ps1
```

**macOS / Linux / Git Bash** — uses `openssl`:

```bash
bash scripts/setup-release-keystore.sh
```

Either script will prompt for a keystore password, generate `memoir-release.p12`, and either upload secrets via the GitHub CLI or write `github-secrets-to-upload.txt` with paste-ready values.

| Secret name | Description |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded contents of `memoir-release.p12` |
| `ANDROID_KEYSTORE_PASSWORD` | The password you chose when generating the keystore |
| `ANDROID_KEY_ALIAS` | `memoir` (the script sets this for you) |
| `ANDROID_KEY_PASSWORD` | Same value as `ANDROID_KEYSTORE_PASSWORD` for PKCS12 stores |

> **Back up `memoir-release.p12` and the password** to a password manager immediately. If you lose either, users will have to uninstall before they can install a future update.

**Cutting a release**

```bash
# Bump expo.version in app.json + the version in package.json, then commit.
git tag v0.5.0
git push origin v0.5.0
```

GitHub Actions will install dependencies, run `expo prebuild`, sign the APK with the stored keystore, and attach `memoir-<version>.apk` to a new GitHub Release.

### Contributing

Contributions, bug reports, and design feedback are all welcome. Memoir is intentionally small, so it is a friendly place for first-time contributors.

**Ground rules**

1. **Be kind.** This project follows the spirit of the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
2. **Keep it local-first.** Memoir never uploads photos or telemetry. Pull requests that introduce remote calls, analytics, or third-party trackers will be declined.
3. **Stay aligned with the design language.** Glass, restraint, and platform-native gestures over heavy chrome.

**Submitting a pull request**

1. Fork the repository and create a branch off `main`.
2. Install dependencies with `bun install`.
3. Make your change. Keep PRs focused — one feature or fix per branch.
4. Verify the project still typechecks:
   ```bash
   bunx tsc --noEmit
   ```
5. Test on a real platform (iOS Simulator, Android emulator, or a physical device).
6. Open the pull request against `main` and fill out the description. Link any issues it closes with `Closes #123`.

**Coding conventions**

- TypeScript strict mode — no `any` unless explicitly justified.
- Components live under `src/components/`; screens live under `app/`.
- Theme values come from `src/theme/tokens.ts` — do not hardcode colors or spacing.
- Animations belong in `react-native-reanimated`.
- Prefer composition over new top-level dependencies.

**Areas that need help**

- More smart albums (Live Photos detection, Places)
- Real shared-element transition between grid and viewer
- Accessibility pass (screen-reader labels, larger text support, reduce-motion)
- iPad / large-screen layouts

---

## License

Released under the [MIT License](LICENSE) — Copyright © 2026 Deon.
