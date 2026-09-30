This is a Kotlin Multiplatform project targeting Android, iOS, Desktop (JVM).

- [/composeApp](./composeApp/src) is for code that will be shared across your Compose Multiplatform applications.
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
  ./gradlew :composeApp:assembleDebug
  ```
- on Windows
  ```shell
  .\gradlew.bat :composeApp:assembleDebug
  ```

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
./gradlew :composeApp:assembleRelease
```

The unsigned APK will be at: `composeApp/build/outputs/apk/release/composeApp-release-unsigned.apk`

#### 3. Sign the APK

```shell
# Sign with apksigner (recommended)
apksigner sign --ks release.keystore --ks-key-alias ao3tracker --out app-release.apk composeApp/build/outputs/apk/release/composeApp-release-unsigned.apk

# Or use jarsigner (legacy)
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore release.keystore composeApp/build/outputs/apk/release/composeApp-release-unsigned.apk ao3tracker
```

#### 4. Build Release Bundle (for Play Store)

```shell
./gradlew :composeApp:bundleRelease
```

The unsigned AAB will be at: `composeApp/build/outputs/bundle/release/composeApp-release.aab`

#### 5. Sign the Bundle

```shell
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore release.keystore composeApp/build/outputs/bundle/release/composeApp-release.aab ao3tracker
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

---

Learn more about [Kotlin Multiplatform](https://www.jetbrains.com/help/kotlin-multiplatform-dev/get-started.html)…
