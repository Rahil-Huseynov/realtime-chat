# Android setup & testing

- Package: `com.realtimechat.app`
- Native incoming-call implementation: `plugins/android-call/.../*.kt`
- Config plugin: `plugins/android-call/withAndroidCall.js`
- Firebase Android config: `google-services.json` (download from Firebase; not included)
- Server FCM credentials: server `.env` only (never embed service-account JSON in the APK)

## Build prerequisites
Node 22, JDK 17, Android Studio/SDK, a physical Android device, Firebase project, and a development build. Expo Go cannot load the custom native FCM service or call activity.

```bash
npm install
npx expo prebuild --clean --platform android
npx expo run:android
```
Set `EXPO_PUBLIC_API_URL` to an address reachable from the phone before building. For a physical device on the same LAN, use the development computer's LAN IP. Do not use `localhost` or `10.0.2.2` on a physical phone.

## Test checklist
1. Install the app on two Android devices and create/verify two accounts.
2. Confirm FCM token registration in the API database.
3. Start an audio call from device A to B with B foregrounded; accept and verify two-way audio.
4. Repeat with video and verify both camera streams.
5. Swipe B's app away, lock its screen, call again and test the native incoming-call UI.
6. Test Reject, notification permission denied, battery saver, Doze, Wi-Fi to LTE switch and app process killed.
7. Repeat on Android 13, 14 and 15 devices if those are target OS versions.

## Android 14+ full-screen access
`USE_FULL_SCREEN_INTENT` is a special app access. Android/Google Play may not grant it automatically unless the app genuinely qualifies as a calling app. Complete the relevant Play Console declaration and gracefully support notification-only fallback when permission is unavailable. Do not try to bypass OS or Play policy.
