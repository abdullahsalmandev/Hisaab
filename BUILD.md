# Building Hisaab for Android

Hisaab makes no network calls. A release APK contains the JS bundle and works fully offline.

This repo is public. Never commit a keystore, a password, or a gradle properties file with secrets. `.gitignore` blocks `*.keystore`, `*.jks`, `*.apk`, `*.aab`, `android/`, `ios/`, `gradle.properties` and `keystore.properties`, but keep these files outside the repo anyway.

## A) Local build (preferred, nothing leaves your machine)

### Prerequisites

- JDK 17
- Android Studio with an Android SDK installed
- `ANDROID_HOME` set to the SDK path (for example `export ANDROID_HOME=$HOME/Android/Sdk`)
- `npm install` already run in the repo

### 1. Generate the native project

```bash
npx expo prebuild -p android
```

This creates `android/`, which is git-ignored.

### 2. Create a release keystore (once, outside the repo)

```bash
mkdir -p ~/keystores
keytool -genkeypair -v -storetype PKCS12 \
  -keystore ~/keystores/hisaab-release.keystore \
  -alias hisaab -keyalg RSA -keysize 2048 -validity 10000
```

Choose a strong password and remember the alias (`hisaab`). See the warning in section D.

### 3. Store the passwords outside the repo

Add to `~/.gradle/gradle.properties` (your home directory, not the repo):

```properties
HISAAB_STORE_FILE=/home/you/keystores/hisaab-release.keystore
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

The values come from `~/.gradle/gradle.properties`, so no secret appears in the file. The build fails with a missing property error if step 3 was skipped.

### 5. Build

```bash
cd android && ./gradlew assembleRelease
```

### 6. Output

```
android/app/build/outputs/apk/release/app-release.apk
```

### 7. Install on the phone

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

The `preview` profile in `eas.json` produces an APK. EAS compiles in the cloud, so your source is uploaded to Expo's build servers. The app itself stays offline: the resulting APK makes no network calls. Download the APK from the link EAS prints and install it as in step 7.

## C) Updating the app later

1. In `app.json`, bump `android.versionCode` (integer, must increase every release) and `version` (for example `1.0.1`).
2. Sign with the SAME keystore and alias. A different key means Android refuses to install over the existing app.
3. In the old app, go to Settings and export a backup before installing.
4. Rebuild, then install over the old app with `adb install -r app-release.apk` (or open the APK on the phone). Data is kept when the signature matches.

`prebuild` generates `android/` from `app.json`. After changing the version, regenerate with `npx expo prebuild -p android --clean`, then re-apply the signing edit from step 4. Alternatively edit `versionCode` and `versionName` in `android/app/build.gradle` directly.

## D) WARNING: back up your keystore

Back up `hisaab-release.keystore`, the alias, and both passwords somewhere safe and separate from this machine (for example a password manager plus an encrypted copy of the file).

- If you lose the keystore or passwords, you can never sign an update that installs over the old app.
- The only way forward is to uninstall the old app, and uninstalling deletes all Hisaab data on the phone.
- Export a backup from Settings first, and keep that file safe as well.
