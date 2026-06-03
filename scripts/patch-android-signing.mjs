// Inject release-signing config into android/app/build.gradle after `expo prebuild`.
// Reads credentials from env vars set in CI:
//   ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
// The keystore file is expected at android/app/release.keystore.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const gradlePath = 'android/app/build.gradle';
if (!existsSync(gradlePath)) {
  console.error(`patch-android-signing: ${gradlePath} not found. Did prebuild run?`);
  process.exit(1);
}

let gradle = readFileSync(gradlePath, 'utf8');

const releaseSigningBlock = `
        release {
            storeFile file('release.keystore')
            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD') ?: ''
            keyAlias System.getenv('ANDROID_KEY_ALIAS') ?: ''
            keyPassword System.getenv('ANDROID_KEY_PASSWORD') ?: ''
        }`;

// 1. Add a `release` signingConfig next to the existing `debug` one.
const debugBlockRe = /(signingConfigs\s*\{[\s\S]*?debug\s*\{[\s\S]*?\})/;
if (!debugBlockRe.test(gradle)) {
  console.error('patch-android-signing: could not find signingConfigs.debug block');
  process.exit(1);
}
if (gradle.includes('release {\n            storeFile file(\'release.keystore\')')) {
  console.log('patch-android-signing: release signing config already present, skipping insert');
} else {
  gradle = gradle.replace(debugBlockRe, `$1${releaseSigningBlock}`);
}

// 2. Point the `release` buildType at signingConfigs.release.
const buildTypeRe = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.)debug/;
if (!buildTypeRe.test(gradle)) {
  console.error('patch-android-signing: could not find buildTypes.release signingConfig');
  process.exit(1);
}
gradle = gradle.replace(buildTypeRe, '$1release');

writeFileSync(gradlePath, gradle);
console.log('patch-android-signing: wrote release signing config to', gradlePath);
