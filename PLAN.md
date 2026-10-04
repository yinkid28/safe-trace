# Plan: Build SafeTrace Android APK with Capacitor

## Phase 1 — Install Android Studio (User does this)
1. Download Android Studio from https://developer.android.com/studio
2. During install: uncheck "Android Virtual Device" to save disk space
3. Open Android Studio, let it complete first-time SDK setup
4. After setup, note the SDK location (usually `C:\Users\<user>\AppData\Local\Android\Sdk`)
5. Set `ANDROID_HOME` environment variable to the SDK path

## Phase 2 — Prep the mobile app (I do this while you install)
1. Install `typescript` as a dev dependency (needed for `capacitor.config.ts`)
2. Add Capacitor Android package (`@capacitor/android`)
3. Verify the Vite build works (`npm run build`)
4. Initialize the Android project (`npx cap add android`)
5. Sync web assets into the Android project (`npx cap sync android`)

## Phase 3 — Build the APK
1. Build debug APK via Gradle wrapper: `cd android && ./gradlew assembleDebug`
2. APK output at: `android/app/build/outputs/apk/debug/app-debug.apk`
3. Test install on a real Android device

## Phase 4 — Landing page update
1. Update the "Get the App" button on the landing page to provide the APK download
2. Host the APK (Firebase Storage or direct link)

## Notes
- Debug APK is unsigned — fine for testing and school demo
- For Play Store later, a signed release APK would be needed
- Background geolocation plugin can be added as a follow-up
