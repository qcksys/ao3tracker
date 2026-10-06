This is a Kotlin Multiplatform project targeting Android, iOS, Desktop (JVM).

- [/androidApp](./androidApp) packages the Android app with AGP 9 and built-in Kotlin. It owns the application manifest, resources, Firebase configuration, signing, and debug/dev/release variants.

- [/composeApp](./composeApp/src) is for code that will be shared across your Compose Multiplatform applications. Its Android target uses `com.android.kotlin.multiplatform.library`; Android UI and platform services remain here.
  It contains several subfolders:
  - [commonMain](./composeApp/src/commonMain/kotlin) is for code that’s common for all targets.
  - Other folders are for Kotlin code that will be compiled for only the platform indicated in the folder name.
    For example, if you want to use Apple’s CoreCrypto for the iOS part of your Kotlin app,
    the [iosMain](./composeApp/src/iosMain/kotlin) folder would be the right place for such calls.
    Similarly, if you want to edit the Desktop (JVM) specific part, the [jvmMain](./composeApp/src/jvmMain/kotlin)
    folder is the appropriate location.

- [/iosApp](./iosApp/iosApp) contains iOS applications. Even if you’re sharing your UI with Compose Multiplatform,
  you need this entry point for your iOS app. This is also where you should add SwiftUI code for your project.

### Build and Run Android Application

To build and run the development version of the Android app, use the run configuration from the run widget
in your IDE’s toolbar or build it directly from the terminal:

- on macOS/Linux
  ```shell
  ./gradlew :androidApp:assembleDebug
  ```
- on Windows
  ```shell
  .\gradlew.bat :androidApp:assembleDebug
  ```

### Android edge-to-edge checks

The activity uses `WindowCompat.enableEdgeToEdge` and light system-bar icons to match
the app's dark theme. `MainScreenScaffold` applies and consumes safe drawing insets,
including display cutouts, before rendering tab content. Its navigation bar handles
the bottom inset, and keyboard padding keeps the app above the IME. Nested screens
must not apply those consumed insets again.

Run the layout regressions and the window test on an emulator or test device:

```shell
./gradlew :composeApp:jvmTest --tests '*MainScreenInsetsTest*'
./gradlew :androidApp:connectedDebugAndroidTest "-Pandroid.testInstrumentationRunnerArguments.class=com.qcksys.ao3tracker.EdgeToEdgeWindowTest"
```

Before a Play release, check Android 14, 15, and 16 with gesture and three-button
navigation, in portrait and landscape, including a display cutout. Repeat with the
device's light and dark themes:

- Open Read (live and saved chapters), Works, Searches, and Settings. Content and
  controls must avoid system bars and cutouts without duplicate top/bottom gaps.
- Open work details and nested Settings screens, dialogs, and bottom sheets.
- Focus a search field and an AO3 WebView field, then dismiss the keyboard. The
  focused field and navigation must remain usable, and spacing must recover.
- Confirm status and navigation icons remain readable after rotating and changing
  the device theme while the app stays open.

See [Android's edge-to-edge setup](https://developer.android.com/develop/ui/compose/system/setup-e2e)
and [Compose inset consumption](https://developer.android.com/develop/ui/compose/system/material-insets).
If Play reports deprecated APIs, retain the exact API names and calling classes
from its expanded warning. AndroidX compatibility code can contain legacy window
calls; passing layout tests does not establish that Play's bundle warning has cleared.

For `production-2026.10.2+044557`, the matching release artifact's R8 mapping and DEX
trace `i1.p` through a synthetic helper to AndroidX Activity's
`EdgeToEdgeApi28.adjustLayoutInDisplayCutoutMode`. Its `SHORT_EDGES` setting supports
Android 9–10; Android 11+ uses `ALWAYS`. The app now uses the current
`WindowCompat.enableEdgeToEdge` API, which still needs compatibility behavior on
older versions. `EdgeToEdgeWindowTest` asserts `ALWAYS` on Android 11+; verify Play's
warning separately after uploading a new bundle.

### Build and Run Desktop (JVM) Application

To build and run the development version of the desktop app, use the run configuration from the run widget
in your IDE’s toolbar or run it directly from the terminal:

- on macOS/Linux
  ```shell
  ./gradlew :composeApp:run
  ```
- on Windows
  ```shell
  .\gradlew.bat :composeApp:run
  ```

### Build and Run iOS Application

To build and run the development version of the iOS app, use the run configuration from the run widget
in your IDE's toolbar or open the [/iosApp](./iosApp) directory in Xcode and run it from there.

---

## Releasing

### Android Release

#### 1. Create a Keystore (first time only)

```shell
keytool -genkey -v -keystore release.keystore -alias ao3tracker -keyalg RSA -keysize 2048 -validity 10000
```

Keep the keystore file and passwords secure. Never commit the keystore to version control.

#### 2. Build Release APK

```shell
./gradlew :androidApp:assembleRelease
```

The unsigned APK will be at: `androidApp/build/outputs/apk/release/androidApp-release-unsigned.apk`

#### 3. Sign the APK

```shell
# Sign with apksigner (recommended)
apksigner sign --ks release.keystore --ks-key-alias ao3tracker --out app-release.apk androidApp/build/outputs/apk/release/androidApp-release-unsigned.apk

# Or use jarsigner (legacy)
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore release.keystore androidApp/build/outputs/apk/release/androidApp-release-unsigned.apk ao3tracker
```

#### 4. Build Release Bundle (for Play Store)

```shell
./gradlew :androidApp:bundleRelease
```

The unsigned AAB will be at: `androidApp/build/outputs/bundle/release/androidApp-release.aab`

#### 5. Sign the Bundle

```shell
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore release.keystore androidApp/build/outputs/bundle/release/androidApp-release.aab ao3tracker
```

#### Play Store Upload

1. Go to [Google Play Console](https://play.google.com/console)
2. Select your app or create a new one
3. Navigate to Release > Production (or Testing track)
4. Upload the signed `.aab` file
5. Complete the release notes and roll out

### iOS Release

#### 1. Open in Xcode

Open the `iosApp/` directory in Xcode.

#### 2. Configure Signing

1. Select the project in the navigator
2. Go to "Signing & Capabilities" tab
3. Select your Team and configure the Bundle Identifier
4. Ensure "Automatically manage signing" is enabled (or configure manually)

#### 3. Archive for Distribution

1. Select "Any iOS Device" as the build target
2. Go to Product > Archive
3. Once complete, the Organizer window will open
4. Click "Distribute App" and follow the prompts for App Store or Ad Hoc distribution

#### 4. Upload to App Store Connect

1. In the Organizer, select "App Store Connect" distribution
2. Follow the upload wizard
3. Go to [App Store Connect](https://appstoreconnect.apple.com) to complete the submission

### Desktop (JVM) Release

#### Build Distribution Package

```shell
./gradlew :composeApp:packageDistributionForCurrentOS
```

This creates platform-specific installers in `composeApp/build/compose/binaries/main/`.

## Dependency maintenance

The 2026-10-06 review migrated the deprecated Koin application declaration,
Compose preview annotation/dependency, and kotlinx-datetime day accessors.

PostHog KMP remains on 0.5.2 with its existing SwiftPM linkage. Upgrade it separately
with the macOS linkage regeneration and crash/relaunch checks described below.
The Android 15 crash encountered during the dependency review also reproduced
with 0.5.2 in the AGP 8/API 36 control; it was caused by saved-reader WebView
teardown, not the PostHog update.

Saved-reader teardown lets `WebView.destroy()` release its message bridge.
Explicitly removing the bridge immediately before destruction crashed WebView
124 while a page-ready message was pending. Late callbacks now check the view's
released state before accessing it, and renderer failure detaches and destroys
the view only once. The reader device test switches accounts five times to
exercise teardown while saved chapters finish loading.

WebView can also deliver a scroll after a layout change but before the resize or
appearance notification. That changed a saved 42% position to 35% during a theme
change. The offline script checks viewport size, chapter height, and appearance
before updating progress, preserving the reading position until layout restoration
finishes. Regression tests cover both the early scroll and a pending progress timer.

The Android app now uses AGP 9.4.1, Gradle 9.6.0, and compile/target SDK 37.
Install `platforms;android-37.0` and `build-tools;36.0.0`; minimum Android remains
API 24. The separate `androidApp` module uses built-in Kotlin, and `composeApp`
uses the supported Android KMP library plugin. See the
[Android migration guide](https://developer.android.com/kotlin/multiplatform/plugin)
and [AGP 9.4 requirements](https://developer.android.com/build/releases/agp-9-4-0-release-notes).

| Dependency            | Before | After  |
| --------------------- | ------ | ------ |
| Compose Multiplatform | 1.11.1 | 1.12.1 |
| Lifecycle             | 2.10.0 | 2.11.0 |
| Coil                  | 3.5.0  | 3.6.3  |
| Ktor                  | 3.5.2  | 3.6.0  |

The separate R8 and experimental Lint overrides are removed. The shared module
applies AGP's `com.android.lint` plugin so lint analyzes its sources, and the
application enables dependency checks. Gradle task
registration and Compose dependencies use their current APIs. Material 3 stays
on the existing stable 1.9.0 line, and Material Icons Extended stays on its final
1.7.3 release. Ktor 3.6 normalizes malformed URL percent escapes; explicit
validation preserves rejection of invalid reader links and saved-search tags.

The new lint plugin also checks JVM code. `lint.xml` excludes `RestrictedApi`
only in Room's generated JVM database implementations; Room generates those
calls to its own restricted runtime APIs. Application source remains checked.

`AndroidApplication` supplies version information and server-selection permissions
to the shared module before storage and diagnostics initialization. Unit tests
run against debug, dev, and release to verify their defaults, permissions, and
credential associations. Shared Android host/device tests are in
`composeApp/src/androidHostTest` and `composeApp/src/androidDeviceTest`; the
packaged window test is in `androidApp/src/androidTest`.

```shell
./gradlew :composeApp:jvmTest :composeApp:testAndroidHostTest :androidApp:testDebugUnitTest :androidApp:testDevUnitTest :androidApp:testReleaseUnitTest
./gradlew :androidApp:assembleDebug :androidApp:assembleDev :androidApp:bundleRelease :composeApp:lint :androidApp:lintDebug :androidApp:lintRelease
./gradlew :composeApp:connectedAndroidDeviceTest :androidApp:connectedDebugAndroidTest
```

The shared device tests use a separate test application and preserve access to
internal reader fixtures. The packaged window test exercises the real Android
application and its startup configuration. Run both on Android 15 and Android 17
when changing the toolchain or Compose.

Validation recorded on 2026-10-06:

- Before migration: JVM/Android unit tests, debug and minified Dev builds,
  release bundle, and debug/release lint passed.
- After migration: 338 JVM tests, 127 shared Android host tests, and three
  application tests in each of debug/dev/release passed. WebView tests (84) and
  CI/release workflow tests (34) passed. Debug APK, minified Dev APK, and unsigned
  release bundle built successfully.
- Android lint reported zero errors: 46 warnings and one hint in shared code,
  and 64 warnings and one hint in each packaged variant including dependencies.
  Before migration, debug/release lint reported 79/81 warnings and one hint each.
  JVM lint also passed with zero errors and six warnings.
- Android 17, using a 16 KB page-size emulator: packaged edge-to-edge window,
  reader rendering, rotation, downloads, controls, and explicit cold-start
  prepare/verify tests passed. The final run used software GLES with Vulkan
  disabled (`-gpu swiftshader -feature -Vulkan`) after the host emulator exited
  under Vulkan; see [emulator troubleshooting](https://developer.android.com/studio/run/emulator-troubleshooting).
- Android 15 with WebView 124: three complete reader suites passed after the
  teardown and rotation fixes, including five account switches per run. Packaged
  window and explicit cold-start prepare/force-stop/verify checks passed.
  Before the fixes, the account-switch regression crashed the process and both
  new layout-ordering script tests failed; all now pass.
- iOS builds and simulator tests were not run on Windows; they require macOS/Xcode.

The WebView scripts use the shared workspace catalog. Biome was updated from
2.5.14 to 2.5.15; Node type definitions stay on 24.x to match the pinned runtime.

Remaining source deprecations require separate migrations:

- AndroidX Security Crypto is deprecated. Replacing `MasterKey` and
  `EncryptedSharedPreferences` requires an Android Keystore-backed storage design
  and migration tests preserving existing tokens and settings. See the
  [Security release notes](https://developer.android.com/jetpack/androidx/releases/security).
- Firebase Messaging's `getToken` and `onNewToken` still serve the current push
  registration contract. Its replacement uses Firebase installation IDs and
  requires coordinated registration/delivery changes and testing across the app
  and API. See the [Firebase Messaging changelog](https://github.com/firebase/firebase-android-sdk/blob/main/firebase-messaging/CHANGELOG.md).
- The window instrumentation test checks the manifest's `adjustResize` setting;
  Android still recommends that manifest setting for keyboard insets even though
  the corresponding Java constant is deprecated.

For dependency updates, compare JVM tests, Android unit tests, debug builds,
minified Dev and release builds, and debug/release lint before and after. Use
`--warning-mode all` to expose build deprecations. Run Android startup and reader
instrumentation tests after changes to Compose, Koin, or SDK initialization.
iOS integration, archives, and simulator tests require macOS/Xcode.

## Crash reporting

The native app uses [PostHog KMP error tracking](https://posthog.com/docs/error-tracking/installation/kmp). Unhandled exceptions and the Developer settings test error use the selected API's `/ingest/native` proxy. Deploy the API before distributing a client update. Both EU projects must have exception autocapture enabled: `ao3tracker-dev` (291114) and `ao3tracker` (69100).

The SDK saves pending crashes to disk and retries on later launches. Diagnostic opt-out and incognito stop new collection; reports collected while enabled can still be delivered. Crash details include exception messages and stacks, so avoid putting credentials or reading content in thrown error messages.

Android's PostHog Gradle plugin embeds the mapping ID and uploads R8 mappings in the store workflow. See [release credential setup](../../docs/store-releases.md#google-play). The developer test error can verify delivery after installation; a real fatal crash must be followed by relaunching the app to verify recovery.

iOS uses Kotlin 2.4 SwiftPM linkage. The generated `iosApp/KotlinMultiplatformLinkedPackage` and its Xcode reference are checked in. After upgrading the SDK, run on macOS from this directory:

```shell
XCODEPROJ_PATH="$PWD/iosApp/iosApp.xcodeproj" ./gradlew :composeApp:integrateLinkagePackage
```

Commit generated linkage and SwiftPM lock-file changes. Archive and test on macOS before shipping iOS, including a crash and relaunch. Upload the archive's dSYMs using [PostHog's iOS symbol instructions](https://posthog.com/docs/error-tracking/upload-source-maps/ios); Android R8 mappings do not symbolicate iOS crashes.

Desktop release packaging includes the PostHog/Gson ProGuard rules and `jdk.unsupported` needed to deserialize persisted reports. The JVM regression tests launch isolated processes, crash with failed delivery, then verify replay after restart through the configured proxy.

---

Learn more about [Kotlin Multiplatform](https://www.jetbrains.com/help/kotlin-multiplatform-dev/get-started.html)…
