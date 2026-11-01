# Recall on mobile

End-user installation is documented in the root [README](../README.md#android), including the Android APK download and browser/iPhone PWA option.

Android bundles the standalone React study interface. Choose **Use without a server** to use IndexedDB and portable quiz files, including on first launch without a network. Imports, editing, dependency learning, sessions and exports all run locally. Optional server mode loads your explicitly entered HTTPS server; no deployment URL or credentials are compiled into the APK. The two origins keep separate storage.

Import through the JSON file picker, or Open with Recall for supported JSON content URIs from another app. The UI previews all imports. Native export opens ACTION_CREATE_DOCUMENT; the user chooses where the JSON file is written. A narrow WebMessage listener accepts only main-frame messages from the chosen HTTPS origin, with a 5 MB limit. It can signal readiness or request a JSON save picker; it exposes no arbitrary filesystem reads or methods. External import URIs must use content:// and their data is passed as quoted text into the local import preview, never executed as code. See [Android's WebViewAssetLoader guidance](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content).

TLS validation is normal; mixed content, file:// access, third-party cookies and WebView debugging are disabled. App data is excluded from Android cloud backup. Keep Android System WebView current for native file export. Clear app data only after exporting personal backups.

## Build

Run `npm ci` in the repository, then with JDK 17+ and Android SDK 35 installed:

```sh
cd mobile/android
./gradlew testDebugUnitTest assembleDebug
```

Gradle's pre-build step bundles the web UI into generated assets using Node. It does not contact a quiz server or include private banks. The debug APK is under `app/build/outputs/apk/debug/`. Development tools are not required to install the published APK.

The current APK is a preview signed with the development certificate. Physical-device verification and stable release signing remain open. iPhone uses the browser app through Safari's Add to Home Screen; native iOS is future work. Portable files transfer quizzes and optional progress between all clients without a central server.
