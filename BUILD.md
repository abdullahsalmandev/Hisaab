# Building Hisaab for Android

Hisaab makes no network calls. A release APK contains the JS bundle and works fully offline.

This repo is public. Never commit a keystore, a password, or a gradle properties file with secrets. `.gitignore` blocks `*.keystore`, `*.jks`, `*.apk`, `*.aab`, `android/`, `ios/`, `gradle.properties` and `keystore.properties`, but keep these files outside the repo anyway.

## A) Local build (preferred, nothing leaves your machine)

### Prerequisites

- JDK 17. If another JDK is your default, do not change it globally; set `JAVA_HOME` on the build command only (step 6).
- Android SDK with `ANDROID_HOME` set to its path (for example `export ANDROID_HOME=$HOME/Android/Sdk`). Android Studio installs one, or use the command-line tools alone:
  ```bash
  sdkmanager --licenses
  sdkmanager "platform-tools" "platforms;android-37.0" "build-tools;37.0.0" "ndk;27.1.12297006"
  ```
  These versions are what `prebuild` generated for Expo SDK 58 (React Native 0.88). After an SDK upgrade, check `compileSdk`, `buildTools` and `ndkVersion` in `node_modules/react-native/gradle/libs.versions.toml`.
- Node 22 (see `.nvmrc`) and `npm install` already run in the repo

### 1. Generate the native project

```bash
npx expo prebuild -p android
```

This creates `android/`, which is git-ignored. It also rewrites the `android` and `ios` scripts in `package.json` to `expo run:android` and `expo run:ios`; undo that with `git checkout package.json` if you don't want it.

### 2. Create a release keystore (once, outside the repo)

```bash
mkdir -p ~/keys
keytool -genkeypair -v -storetype PKCS12 \
  -keystore ~/keys/hisaab-release.jks \
  -alias hisaab -keyalg RSA -keysize 2048 -validity 10000
```

Choose a strong password and remember the alias (`hisaab`). See the warning in section D.

### 3. Store the passwords outside the repo

Add to `~/.gradle/gradle.properties` (your home directory, not the repo):

```properties
HISAAB_STORE_FILE=/home/you/keys/hisaab-release.jks
HISAAB_STORE_PASSWORD=your-store-password
HISAAB_KEY_ALIAS=hisaab
HISAAB_KEY_PASSWORD=your-key-password
```

Use the absolute path for `HISAAB_STORE_FILE`. With a PKCS12 keystore the key password is the same as the store password.

### 4. Configure the release signing config

In `android/app/build.gradle`, add a `release` entry inside the existing `signingConfigs` block, and point the `release` build type at it:

```groovy
android {
    signingConfigs {
        // keep the generated debug { ... } entry
        release {
            storeFile file(HISAAB_STORE_FILE)
            storePassword HISAAB_STORE_PASSWORD
            keyAlias HISAAB_KEY_ALIAS
            keyPassword HISAAB_KEY_PASSWORD
        }
    }
    buildTypes {
        release {
            // change the generated "signingConfig signingConfigs.debug" to:
            signingConfig signingConfigs.release
        }
    }
}
```

The values come from `~/.gradle/gradle.properties`, so no secret appears in the file. Any Gradle build (not just release) fails with a missing property error if step 3 was skipped, because the signing config is read at configuration time.

### 5. Build for arm64-v8a only

`expo-build-properties` is not installed, so the target ABI is set by hand. In `android/gradle.properties` (the generated one inside the repo's git-ignored `android/`, not the one in your home directory), change the existing line to:

```properties
reactNativeArchitectures=arm64-v8a
```

`prebuild` regenerates this file, so re-apply the line after every prebuild. This cuts build time and APK size; modern phones are arm64. Do not use this APK on an emulator or a 32-bit phone.

### 6. Build

```bash
cd android && JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 ./gradlew assembleRelease
```

The first build downloads Gradle and the dependencies and compiles native code, so expect it to take a while.

### 7. Output

```
android/app/build/outputs/apk/release/app-release.apk
```

### 8. Install on the phone

With USB debugging enabled and the phone connected:

```bash
adb install android/app/build/outputs/apk/release/app-release.apk
```

Or copy the APK to the phone (USB, cloud drive, any file transfer) and open it. Android will ask you to allow installs from that source.

## B) EAS fallback (cloud build)

```bash
npm i -g eas-cli
eas login
eas build -p android --profile preview
```

The `preview` profile in `eas.json` produces an APK. EAS compiles in the cloud, so your source is uploaded to Expo's build servers. The app itself stays offline: the resulting APK makes no network calls. Download the APK from the link EAS prints and install it as in step 8.

## C) Updating the app on the phone

1. In the app, go to Settings and export a backup. Keep the file off the phone too.
2. In `app.json`, bump `version` (for example `1.1.1`) and increase `android.versionCode` by 1 (it must grow every release).
3. Regenerate the native project: `npx expo prebuild -p android --clean`.
4. Re-apply the two edits that prebuild wipes: the release signing config (step 4) and `reactNativeArchitectures=arm64-v8a` (step 5).
5. Build with JDK 17: `cd android && JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 ./gradlew assembleRelease`.
6. Install over the old app: `adb install -r android/app/build/outputs/apk/release/app-release.apk`, or open the APK on the phone. The package name and keystore must be the same as before; then Android keeps the data. A different key means Android refuses the install (see section D).

Notes:

- `app.json` blocks the `INTERNET` permission, so the release APK cannot reach any network. That is intended, the app makes no network calls.
- The dev server workflow (`npx expo start`) is unaffected.

## D) WARNING: back up your keystore

Back up `hisaab-release.jks`, the alias, and both passwords somewhere safe and separate from this machine (for example a password manager plus an encrypted copy of the file).

- If you lose the keystore or passwords, you can never sign an update that installs over the old app.
- The only way forward is to uninstall the old app, and uninstalling deletes all Hisaab data on the phone.
- Export a backup from Settings first, and keep that file safe as well.
