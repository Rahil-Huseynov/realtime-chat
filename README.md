# Realtime Chat — Android-first complete source project

Stack: Next.js web client, NestJS API, Prisma/PostgreSQL, Socket.IO, React Native/Expo Android development build, Firebase Cloud Messaging, native Kotlin incoming-call activity, WebRTC and coturn.

## Feature set in this source
- Email registration, email verification, login and JWT sessions
- User directory, 1:1 conversations, message history and realtime messages
- Audio/video call creation and Socket.IO signaling
- Android FCM device-token registration and high-priority data push
- Native Kotlin FCM receiver, Android full-screen incoming-call activity, Accept/Reject handoff, FCM token bridge and active-call foreground service
- Web and Android chat/call client foundations
- Docker Compose for API, web, PostgreSQL, Mailpit and coturn

## Important honest limits
This is a full source implementation baseline, not a certified release build. It has not been installed on your physical Android device or tested with your Firebase project, carrier/Wi-Fi NATs, and Play Console account. FCM delivery, full-screen display, background restrictions, camera/microphone permissions, WebRTC media negotiation and TURN connectivity must be validated on at least two real Android devices before production. Android 14+ may restrict full-screen intents until the user grants the special access or Google Play accepts the app's calling-core-function declaration. This is controlled by Android/Google Play, not by application code. See the official policy references in the Android setup guide.

## 1. Configure Firebase (required for Android incoming push)
1. Create a Firebase project and add an Android app with package ID `com.realtimechat.app`.
2. Download `google-services.json` and put it at `apps/mobile/google-services.json`. Do not commit it to a public repository.
3. Create a Firebase service account for server-side messaging. Set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` in the server `.env` (private key newlines may be `\\n`). Never put the service-account private key in the mobile app.
4. In `apps/mobile/app.json`, `googleServicesFile` already points to this file.

## 2. Configure the server
```bash
cp .env.example .env
# Change POSTGRES_PASSWORD, JWT_SECRET, TURN_SECRET, TURN_HOST and public URLs.
```
`TURN_HOST` must be a public DNS name/IP for the coturn server, not localhost when devices are outside the same machine. Open TCP/UDP 3478 and UDP 49160-49200 in the host firewall. Use TLS/TURNS for production and configure TLS certificates/reverse proxy.

Start services:
```bash
docker compose up --build -d
```
- Web: http://localhost:3000
- API: http://localhost:4000
- Mailpit inbox: http://localhost:8025

Email verification links are delivered to Mailpit in this local Compose setup. Configure a real SMTP provider for production. The API currently runs Prisma `db push` at container start for a simple first boot; switch to committed Prisma migrations and `prisma migrate deploy` before production use.

## 3. Run Android native app
Use Node 22, Android Studio, Android SDK, JDK 17 and a physical Android device (or emulator for UI-only testing). Set the phone-reachable API address. Example: `EXPO_PUBLIC_API_URL=http://192.168.1.20:4000` (not localhost on a physical phone).
```bash
cd apps/mobile
npm install
npx expo prebuild --clean --platform android
npx expo run:android
```
Expo Go is not supported: the FCM receiver and full-screen call activity are native Android code. The config plugin adds Kotlin classes, FCM service registration, notification/call permissions and app deep-link handling during prebuild.

For a release APK/AAB use a configured Android signing key and EAS or Gradle release build. Do not distribute a debug build as a production release.

## Android incoming-call behavior
- FCM sends a high-priority data-only message with call ID/type/expiry.
- Native `IncomingCallMessagingService` receives it while the app process is not running, validates expiry and posts a Call-category full-screen notification.
- `IncomingCallActivity` shows caller and Accept/Reject controls on the lock screen when Android allows it.
- The action deep-links to `realtimechat://call/accept` or `/reject`; React Native reconnects its authenticated Socket.IO session and emits the appropriate call event.
- If Android blocks full-screen intent, the notification falls back to a heads-up/notification surface. Users can manage the special access in Android Settings. Google Play's policy declaration is required where applicable.

## API
- `POST /auth/register` `{email,password,displayName}`
- `POST /auth/verify` `{token}`
- `POST /auth/login` `{email,password}`
- `POST /auth/me` with Bearer token
- `GET /users`, `GET /conversations`, `POST /conversations` `{otherUserId}`
- `GET /conversations/:id/messages`, `POST /conversations/:id/messages` `{body}`
- `POST /devices` `{fcmToken}`
- `POST /calls` `{calleeId,type:AUDIO|VIDEO}`
- `GET /calls/ice-config`

Socket namespace `/realtime`; auth `{token}`. Events: `message:send`, `message:new`, `call:incoming`, `call:accept`, `call:accepted`, `call:reject`, `call:rejected`, `call:signal`, `call:end`, `call:ended`.

## Before production
- Add password reset, refresh-token rotation/revocation, rate limiting, account deletion, blocking/reporting and abuse controls.
- Add message pagination/read receipts, attachments with object storage and malware scanning.
- Add call expiry/timeout worker, missed-call persistence, duplicate call handling, push retry/observability and device-token lifecycle.
- Add Redis Socket.IO adapter before horizontal API scaling.
- Add call encryption/security review, TURN TLS, backups, metrics/logging and load tests.
- Test app killed, backgrounded, battery saver, Doze, Wi-Fi/mobile transitions, locked screen, denied notification permission and Android 14+ full-screen access on multiple OEM devices.
