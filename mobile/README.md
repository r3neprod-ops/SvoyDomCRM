# CRM24 Mobile

This folder contains the mobile shell assets for the native Android app.

The Android project lives in `android/` and opens `https://24crmka.ru` inside the native app container.

## Commands

```bash
npm run mobile:sync
npm run mobile:open:android
npm run mobile:build:android:debug
npm run mobile:build:android:release
npm run mobile:build:android:aab
```

## Outputs

Debug APK for manual testing:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Signed release APK for direct Android distribution:

```text
android/app/build/outputs/apk/release/app-release.apk
```

Signed Android App Bundle for Google Play and RuStore:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

## Signing

Release signing is configured through `android/keystore.properties`, which is intentionally ignored by Git.

Keep the release keystore safe. Future app updates must use the same signing key.
