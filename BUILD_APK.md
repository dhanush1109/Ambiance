# Building the Ambiance APK (Windows)

Ambiance is a React app wrapped with Capacitor. The Android build turns it into
a normal installable APK that talks to the controller over Bluetooth directly —
no PC, no `server.py`, nothing else running.

Everything below is run from the `web` folder unless stated otherwise.

---

> **Already done on this machine.** JDK 21, the Android SDK (platform 35 +
> build-tools 35.0.0) and the Android project are installed, and a debug APK is
> built at `Ambiance-debug.apk` in the project root. `ANDROID_HOME` and
> `JAVA_HOME` are set as user environment variables, so a **new** terminal picks
> them up automatically. To rebuild after changing the app:
>
> ```powershell
> $env:Path = "C:\Program Files\nodejs;$env:Path"
> cd "c:\Users\ADMIN\Desktop\Ambient Light\web"
> npm run build ; npx cap sync android
> cd android ; .\gradlew.bat assembleDebug
> ```
>
> The sections below document the setup from scratch, for a different machine.

---

## 0. One-time prerequisites

| Need | Why | Where |
|------|-----|-------|
| **JDK 21** | Gradle needs it | [Adoptium Temurin 21](https://adoptium.net/temurin/releases/?version=21) |
| **Android Studio** | Ships the Android SDK and `adb` | [developer.android.com/studio](https://developer.android.com/studio) |
| **SDK Platform 35** | Build target | Android Studio → More Actions → SDK Manager |

Node lives at `C:\Program Files\nodejs` on this machine and is **not on PATH**.
Every terminal session needs this first:

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
```

Set these permanently (Settings → System → About → Advanced system settings →
Environment Variables), then open a **new** terminal:

```
JAVA_HOME     C:\Program Files\Eclipse Adoptium\jdk-21.x.x-hotspot
ANDROID_HOME  C:\Users\ADMIN\AppData\Local\Android\Sdk
```

Verify:

```powershell
java -version      # should say 21
adb version
```

---

## 1. Create the Android project (once)

```powershell
cd "c:\Users\ADMIN\Desktop\Ambient Light\web"
$env:Path = "C:\Program Files\nodejs;$env:Path"

npm install
npm run build
npx cap add android
```

This creates `web/android/`. Commit it or leave it — it can always be regenerated.

---

## 2. Add the Bluetooth permissions (once)

Open `web/android/app/src/main/AndroidManifest.xml` and paste this block
**inside `<manifest>`, above `<application>`**:

```xml
<!-- Android 12+ -->
<uses-permission
    android:name="android.permission.BLUETOOTH_SCAN"
    android:usesPermissionFlags="neverForLocation" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />

<!-- Android 11 and older -->
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />

<uses-feature android:name="android.hardware.bluetooth_le" android:required="true" />
```

`neverForLocation` matters: it tells Android the app is not using Bluetooth to
infer location, so the user is not asked for a location permission it does not need.

Then check `web/android/variables.gradle` reads:

```gradle
minSdkVersion = 26
compileSdkVersion = 35
targetSdkVersion = 35
```

---

## 2a. The intro video (already done — only if you replace Intro.mp4)

The app's opening is `Logo/Intro.mp4`, played at 2x. The shipped copy at
`web/src/assets/intro.mp4` is a **stream copy** — the original encoded video, bit
for bit, no re-encode and so no generation loss (`ffmpeg` reports SSIM 1.000000
and infinite PSNR against the source, true of any stream copy regardless of what
the source looks like). Only the AAC track is dropped, because the intro is
muted by design. Current master: 960x720, 10.006s, H.264 + AAC, faststart.

```powershell
cd "c:\Users\ADMIN\Desktop\Ambient Light\web"
npm install -D ffmpeg-static
npm approve-scripts ffmpeg-static
node_modules\ffmpeg-static\ffmpeg.exe -y -i "..\Logo\Intro.mp4" `
  -c:v copy -an -movflags +faststart src\assets\intro.mp4
```

`-c:v copy` is the point — do **not** substitute `libx264`. `-an` drops the audio,
`+faststart` puts `moov` before `mdat` so the first frame decodes without reading
the whole file.

If you swap in a video of a different length, check `HARD_CAP` in
`web/src/components/LaunchOverlay.jsx`: it must stay above
`duration / 2 + 2500 + 420` ms or it will cut the intro off. A test asserts
exactly that, so `npx vitest run` will tell you.

Android's aapt stores `.mp4` uncompressed, so the APK grows by the file's size.
**The APK is deliberately heavy — every asset is lossless.** See the quality
policy in `web/ARCHITECTURE.md` §9a before optimising anything for size.

---

## 2b. Icons and splash (already done — only if you change the artwork)

The icon and splash are built from `Logo/Logo.png`, the neon Hycross front end.
Both are already generated and committed; this section is only for replacing the
artwork. The old monogram SVGs are parked in `web/resources/_monogram/`.

`web/resources/` holds the pre-composed square masters the generator consumes:
`icon.png` (logo at 82% on black), `icon-foreground.png` (78%, transparent),
`icon-background.png` (black), `splash.png` (55% on black).

```powershell
cd "c:\Users\ADMIN\Desktop\Ambient Light\web"
npm install -D @capacitor/assets
npm approve-scripts sharp     # the generator needs sharp's native binary
npx @capacitor/assets generate --android --iconBackgroundColor '#000000' --splashBackgroundColor '#000000' --splashBackgroundColorDark '#000000'
```

**The generator overwrites three hand-finished things. Re-apply all of them, or
the launcher icon and the APK size both regress.** What they are and why they
exist is documented in `web/ARCHITECTURE.md` §9a:

1. `res/mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml` — colour
   background instead of the inset image, plus the `<monochrome>` layer for
   Android 13+ themed icons.
2. `res/mipmap-*/ic_launcher_monochrome.png` — six densities, not generated at all.

Do **not** recompress the generated splashes. They were once palette-quantised
from 8.46 MB to 2.53 MB; that was reverted because quantising a neon gradient
invites banding. Leave them full 24-bit.

Then check your work before shipping:

```powershell
# label should read Ambiance, icon should resolve to the adaptive XML
& (Get-ChildItem "C:\Android\Sdk\build-tools" -Recurse -Filter aapt2.exe | Select-Object -First 1).FullName `
  dump badging "web\android\app\build\outputs\apk\debug\app-debug.apk" |
  Select-String "application-label:|application:"
```

---

## 3. Build a debug APK

```powershell
cd "c:\Users\ADMIN\Desktop\Ambient Light\web"
$env:Path = "C:\Program Files\nodejs;$env:Path"

npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

The APK lands at:

```
web\android\app\build\outputs\apk\debug\app-debug.apk
```

Install it — phone and tablet plugged in via USB with developer mode on:

```powershell
adb devices           # confirm the device is listed
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

Or copy the file to the device and open it (allow "install unknown apps").

Shortcut for later rebuilds: `npm run android:apk`.

---

## 4. First run

1. Open **Ambiance**.
2. Tap **Connect by MAC**. Android asks for *Nearby devices* — allow it.
3. The car lights up in whatever colours you last used.

The controller must be powered and **not already connected to the Cardi Magic
app** — one BLE link at a time. Force-close that app if the connect fails.

---

## 5. Release APK (signed)

A debug APK expires awkwardly and cannot be updated cleanly. For something you
keep on the car tablet, build a signed release.

**Generate a keystore — once, ever:**

```powershell
cd "c:\Users\ADMIN\Desktop\Ambient Light\web\android"
keytool -genkeypair -v -keystore ambiance.keystore -alias ambiance `
  -keyalg RSA -keysize 2048 -validity 10000
```

> ⚠️ **Back this file up somewhere safe, along with the passwords.**
> Android identifies an app by its signature. Lose this keystore and you can
> never update the installed copy — only uninstall it and start over, losing
> your saved looks and settings.

**Create `web/android/keystore.properties`** (already git-ignored):

```properties
storeFile=ambiance.keystore
storePassword=YOUR_PASSWORD
keyAlias=ambiance
keyPassword=YOUR_PASSWORD
```

**In `web/android/app/build.gradle`**, above `android {`:

```gradle
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file("keystore.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

and inside `android { }`:

```gradle
signingConfigs {
    release {
        storeFile file(keystoreProperties['storeFile'])
        storePassword keystoreProperties['storePassword']
        keyAlias keystoreProperties['keyAlias']
        keyPassword keystoreProperties['keyPassword']
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
    }
}
```

**Build:**

```powershell
.\gradlew.bat assembleRelease
```

Output: `web\android\app\build\outputs\apk\release\app-release.apk`

---

## Troubleshooting

**"Connect by MAC" fails**
The Cardi Magic app is probably holding the link — force-close it. Otherwise
check the controller has power (ignition on).

**Scan finds nothing on a Xiaomi/Redmi/Poco device**
Some OEM builds still gate BLE results behind Location despite
`neverForLocation`. Turn on Location and retry. Connect-by-MAC usually works
regardless, which is why it is the primary path.

**Gradle: "SDK location not found"**
`ANDROID_HOME` is not set, or the terminal predates setting it. Open a new one.

**Gradle: "Unsupported class file major version"**
Wrong JDK. `java -version` must report 21.

**App installs but shows a white screen**
`npm run build` was not re-run before `npx cap sync android`. Use
`npm run android:apk`, which does both.

**Lights lag behind a colour drag**
Expected on a weak link — the app already limits writes to about one every
40 ms and drops stale ones. Move the phone closer to the controller.
