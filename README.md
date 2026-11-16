# Realtime Chat — Android-First Complete Source Project

A real-time messaging and audio/video calling application built with Next.js, NestJS, Prisma, PostgreSQL, Socket.IO, React Native, Expo and native Android Kotlin components.

## Tech Stack

- **Web:** Next.js
- **API:** NestJS, Node.js
- **Database:** PostgreSQL, Prisma ORM
- **Realtime:** Socket.IO
- **Mobile:** React Native, Expo (Android development build)
- **Push Notifications:** Firebase Cloud Messaging (FCM)
- **Native Android:** Kotlin incoming-call activity and foreground service
- **Calling:** WebRTC, coturn

## Features

- Email registration and verification
- Login and JWT authentication
- User directory
- One-to-one conversations
- Message history and real-time messaging
- Audio and video call creation
- Socket.IO call signaling
- Android FCM device-token registration
- High-priority incoming-call push notifications
- Native Kotlin FCM messaging service
- Full-screen incoming-call activity
- Accept and Reject call actions
- FCM token bridge
- Active-call foreground service
- Web and Android client foundations
- Docker Compose configuration for API, web, PostgreSQL, Mailpit and coturn

## Important Limitations

This project is a complete source implementation baseline, not a certified production release.

It has not been validated on physical Android devices with your Firebase project, carrier/Wi-Fi NAT configurations or Google Play Console account.

Before production, validate:

- FCM delivery when the app is backgrounded or terminated
- Android full-screen incoming-call behavior
- Camera and microphone permissions
- WebRTC media negotiation
- TURN connectivity
- Android battery optimization and Doze behavior
- Android 14+ full-screen intent access

Android 14 and later may restrict full-screen intents until the user grants special access or Google Play accepts the app's calling-core-function declaration. This behavior is controlled by Android and Google Play policies, not application code.

---

## 1. Firebase Configuration (Required)

**IMPORTANT: `apps/mobile/google-services.json` is REQUIRED for building and configuring the Android application with Firebase.**

The file is intentionally excluded from Git using `.gitignore` because it contains project-specific Firebase configuration and must not be committed to the public repository.

Every developer setting up this project must obtain their own Firebase configuration file.

### Step 1 — Create a Firebase project

1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Create a Firebase project.
3. Add an Android application.
4. Set the Android package name to:

```text
com.realtimechat.app
```

5. Download the `google-services.json` configuration file.

### Step 2 — Put the required file in the project

Place the downloaded file at exactly this location:

```text
apps/mobile/google-services.json
```

The expected structure is:

```text
realtime-chat/
└── apps/
    └── mobile/
        ├── app.json
        ├── google-services.json   # REQUIRED — not committed to Git
        └── ...
```

**Do not rename the file or put it in another directory.**

The Expo configuration in `apps/mobile/app.json` already references this file through `googleServicesFile`.

If this file is missing, Android prebuild or the Firebase Android configuration may fail.

### Step 3 — Verify the file exists

From the repository root:

```bash
test -f apps/mobile/google-services.json \
  && echo "Firebase configuration found" \
  || echo "ERROR: google-services.json is missing"
```

### Step 4 — Understand Git protection

The following entries are included in the root `.gitignore`:

```gitignore
# Firebase credentials
**/google-services.json
**/GoogleService-Info.plist
```

This means:

- The file must exist locally.
- Android builds can use the local file.
- Git will ignore the file.
- The file will not be uploaded to GitHub.
- Each developer must configure their own Firebase project.

**Do not remove these `.gitignore` rules just to make the file appear in Git.**

### Step 5 — Configure Firebase Admin for the API

Create a Firebase service account for server-side messaging.

Set the following environment variables in the root `.env` file:

```env
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=your-service-account-email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"
```

Never put the service-account private key in the Android application or commit it to Git.

---

## 2. Server Configuration

Copy the environment template:

```bash
cp .env.example .env
```

Configure the following values:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `TURN_SECRET`
- `TURN_HOST`
- Public API and web URLs
- Firebase Admin credentials

Use strong, randomly generated secrets.

### TURN Configuration

`TURN_HOST` must be a publicly reachable DNS name or IP address when devices connect from outside your local network.

Open the following ports in your host firewall:

- TCP/UDP `3478`
- UDP `49160-49200`

For production, configure TLS/TURNS and valid TLS certificates through a reverse proxy or your TURN server.

### Start Docker Services

From the repository root:

```bash
docker compose up --build -d
```

Available services:

| Service | URL |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:4000 |
| Mailpit | http://localhost:8025 |

Email verification messages are delivered to Mailpit in the local Docker Compose setup.

For production, configure a real SMTP provider.

**Database note:** The API currently uses Prisma `db push` at container startup for initial development setup. Before production, use committed Prisma migrations and `prisma migrate deploy`.

---

## 3. Android Application Setup

### Requirements

- Node.js 22
- Android Studio
- Android SDK
- JDK 17
- Physical Android device or emulator

Expo Go is not supported because the project uses custom native Kotlin Android components.

### Configure API URL

Set the phone-reachable API address in your environment configuration.

Example:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000
```

Replace `192.168.1.20` with the actual LAN IP address of the computer running the API.

Do not use `localhost` for a physical Android device. On the phone, `localhost` refers to the phone itself.

### Install and Build

```bash
cd apps/mobile

npm install

npx expo prebuild --clean --platform android

npx expo run:android
```

The Expo config plugin configures the native Android components, including:

- Kotlin FCM messaging service
- Incoming-call activity
- Notification and call permissions
- Deep-link handling
- Native call service integration

### Release Build

For production distribution, configure an Android signing key and use EAS Build or a Gradle release build.

Never distribute an unsigned or debug APK as a production release.

---

## 4. Android Incoming-Call Flow

The incoming-call flow works as follows:

1. The API sends a high-priority, data-only FCM message containing the call ID, call type and expiry.
2. `IncomingCallMessagingService` receives the message, including when the application process is not running, subject to Android and FCM delivery restrictions.
3. The native service validates the call expiry.
4. Android displays a Call-category full-screen notification when permitted.
5. `IncomingCallActivity` displays the caller information and Accept/Reject controls.
6. The action opens the corresponding deep link:

```text
realtimechat://call/accept
realtimechat://call/reject
```

7. React Native reconnects the authenticated Socket.IO session and emits the appropriate call event.

If Android blocks full-screen intent access, the notification may fall back to a heads-up notification or regular notification.

Users can manage full-screen notification access in Android Settings. Google Play policy declarations may also be required.

---

## 5. API Endpoints

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Register an account |
| POST | `/auth/verify` | Verify email |
| POST | `/auth/login` | Login |
| POST | `/auth/me` | Get authenticated user |

### Users and Conversations

| Method | Endpoint | Description |
|---|---|---|
| GET | `/users` | Get user directory |
| GET | `/conversations` | Get conversations |
| POST | `/conversations` | Create a conversation |
| GET | `/conversations/:id/messages` | Get message history |
| POST | `/conversations/:id/messages` | Send a message |

### Devices

| Method | Endpoint | Description |
|---|---|---|
| POST | `/devices` | Register FCM device token |

Request:

```json
{
  "fcmToken": "YOUR_FCM_DEVICE_TOKEN"
}
```

### Calls

| Method | Endpoint | Description |
|---|---|---|
| POST | `/calls` | Create an audio/video call |
| GET | `/calls/ice-config` | Get WebRTC ICE configuration |

Call creation request:

```json
{
  "calleeId": "USER_ID",
  "type": "AUDIO"
}
```

Supported call types:

- `AUDIO`
- `VIDEO`

---

## 6. Socket.IO Events

Socket namespace:

```text
/realtime
```

Authentication:

```json
{
  "token": "JWT_ACCESS_TOKEN"
}
```

### Messaging Events

- `message:send`
- `message:new`

### Calling Events

- `call:incoming`
- `call:accept`
- `call:accepted`
- `call:reject`
- `call:rejected`
- `call:signal`
- `call:end`
- `call:ended`

---

## 7. Before Production

The following areas require additional implementation, validation or hardening before production deployment:

### Security and Authentication

- Password reset
- Refresh-token rotation and revocation
- Rate limiting
- Account deletion
- Blocking and reporting
- Abuse prevention controls

### Messaging

- Message pagination
- Read receipts
- File attachments
- Object storage
- Malware scanning

### Calling and Notifications

- Call expiry and timeout worker
- Missed-call persistence
- Duplicate-call handling
- Push retry and observability
- Device-token lifecycle management

### Infrastructure

- Redis Socket.IO adapter before horizontal API scaling
- TURN over TLS
- Database backups
- Monitoring and metrics
- Structured logging
- Load testing
- Security review and call encryption validation

### Real-Device Testing

Test on at least two physical Android devices:

- Application running
- Application backgrounded
- Application process terminated
- Locked screen
- Battery saver enabled
- Doze mode
- Wi-Fi to mobile network transitions
- Notification permission denied
- Full-screen intent access denied
- Android 14+ behavior
- Different Android manufacturers

---

## 8. Important Configuration Files

| File | Purpose | Git status |
|---|---|---|
| `apps/mobile/google-services.json` | Firebase Android configuration | Ignored — required locally |
| `.env` | Local environment variables and secrets | Ignored |
| `.env.example` | Environment variable template | Tracked |
| `apps/mobile/app.json` | Expo configuration | Tracked |
| `prisma/schema.prisma` | Database schema | Tracked |
| `docker-compose.yml` | Docker services | Tracked |

**Final reminder:** The Firebase `google-services.json` file is required for Android Firebase integration. It must be present locally at `apps/mobile/google-services.json`, even though it is intentionally excluded from GitHub.
