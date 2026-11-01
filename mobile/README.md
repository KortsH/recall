# Recall mobile

The Android starter is a small native container for your self-hosted Recall application. Enter your own HTTPS server origin on first launch; no deployment address or credentials are compiled into the app. It uses the same quiz UI, IndexedDB downloads, learning engine and batched sync as the browser, with local storage isolated by server origin.

Features: persistent server selection, safe navigation, normal TLS validation, JSON file picker, system-bar insets and WebView state restoration. It requests only internet access, uses no JavaScript-to-native bridge, disables mixed content and third-party cookies, and does not back up local study data to the Android cloud-backup service.

Build with JDK 17+, Android SDK 35 and Gradle:

```sh
cd mobile/android
./gradlew testDebugUnitTest assembleDebug
```

Install the resulting debug APK on your own Android phone. It is a development build, not a Play Store release. Connect your private VPN before opening a private server. The initial successful online visit downloads the app; study progress stays on the device until it can sync. Use Recall's Settings to select downloaded or live-server mode. Sync before changing servers or clearing app data.

No physical device is needed to compile the starter. Device testing and a signed release, native navigation polish, iOS and portable progress-bundle import/export remain on the roadmap. iPhone users can already use the installable PWA through Safari's Add to Home Screen.
