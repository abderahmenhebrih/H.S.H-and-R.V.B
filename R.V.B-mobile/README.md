# Poultry Business Suite — R.V.B Mobile

Mobile module **R.V.B** for Poultry Business Suite. Expo (SDK 57) + Expo Router + native authentication via R.V.B backend (`/api/rvb/*`).

> Foundation phase only. Worker/Supplier/Customer business features (orders, requests, chats UI, directory, notifications, activity, PDF) arrive in later phases. This README documents the current foundation.

## Requirements

- Node 20+ (tested 22.x)
- npm
- Expo SDK 57 (`expo@~57.0.25`)
- Backend running at `EXPO_PUBLIC_RVB_API_URL` (e.g. `http://localhost:5000` for web dev, LAN IP for physical device)
- iOS/Android: Expo Go or development build (SecureStore, ImagePicker require native modules -> `expo run:ios|android` or EAS dev build)

## Environment

Create `.env` from template:

```
cp .env.example .env
# edit EXPO_PUBLIC_RVB_API_URL
```

**`.env.example`:**
```
EXPO_PUBLIC_RVB_API_URL=http://192.168.1.100:5000
```

Notes:
- Physical device `localhost` is the device itself. For device/LAN testing use your machine's LAN IP (`ipconfig` -> IPv4, e.g. `http://192.168.1.100:5000`).
- Web dev may use `http://localhost:5000`. CORS must allow Expo web origin (`http://localhost:8081` by default; see backend `CORS_ORIGIN`).
- Validation at startup: if `EXPO_PUBLIC_RVB_API_URL` missing/invalid, app shows clear configuration error instead of crashing.

## Install

```bash
npm install
```

Native modules are installed via `npx expo install <pkg>` for SDK 57 compatibility.

## Start

```bash
npx expo start              # QR + dev server
npx expo start --web        # web dev (http://localhost:8081)
npx expo start --clear      # clear Metro cache
```

- Device: scan QR with Expo Go, or `npx expo run:android` / `npx expo run:ios` for dev build (needed after native deps change).
- Web: `npx expo start --web` bundles via Metro.

## Web development

```bash
npx expo export --platform web   # static export to dist/
```

Verified `dist/` contains `index.html`, `favicon.ico`, `_expo/static/js/web/entry-*.js` (Expo Router entry).

## Device/LAN note

| Context | Recommended URL |
|---|---|
| Web dev on simulator | `http://localhost:5000` |
| Physical iOS/Android via LAN | `http://<your-lan-ip>:5000` (e.g. `http://192.168.100.18:5000`) |
| Android emulator | `http://10.0.2.2:5000` |

Backend `CORS_ORIGIN` must include the web origin (`http://localhost:8081` etc.) otherwise web fetch/SSE will be blocked.

## Authentication architecture

- **Access token**: memory only (`zustand` auth store + `api/client.ts` memory). Never persisted to AsyncStorage/SecureStore, never `console.log`. Sent as `Authorization: Bearer <token>` + `X-RVB-Client: native` for all native API calls; socket `auth: { token }`.
- **Refresh token**: `expo-secure-store` only (`rvb.refreshToken`). No `AsyncStorage`, no plain storage. On web, `expo-secure-store` falls back to `localStorage` shim with same key; abstraction in `src/services/secure-store.ts` keeps native behavior authoritative.
- **Login**: `POST /api/rvb/auth/login` with `X-RVB-Client: native` and `{ tag: normalized, password, native:true }`. Tag normalization: strip `@`, lowercase, regex `^[a-z0-9][a-z0-9._]{2,29}$`. Persist `refreshToken` (SecureStore), keep `accessToken` in memory, store `account`.
- **Session restore (cold start)**: status `booting` -> read SecureStore refreshToken -> `POST /api/rvb/auth/refresh` with `{refreshToken}` -> rotate refresh, set new access/refresh + account. Splash hides only after gate resolves. If no refresh -> `anonymous` -> login. 401 invalid/expired/revoked -> delete SecureStore + local clear. Network failure -> keep SecureStore (do not destroy on transient failure) + `anonymous` with retryable error.
- **Refresh deduplication**: shared `pendingRefreshPromise` mutex (`api/client.ts`). First 401 starts refresh; concurrent requests await same promise, then retry once. No refresh loops (`skipRefresh` flag).
- **Session revoked / archived / disabled**: Any `401 RVB_SESSION_REVOKED` or `403 RVB_ACCOUNT_DISABLED|ARCHIVED` clears access + SecureStore + zustand `anonymous` + router `login`. Socket disconnects.
- **Logout**: `POST /api/rvb/auth/logout` with `Authorization` + `X-Refresh-Token` + body `{refreshToken}` (best effort), then **always** locally clear access, account, SecureStore, disconnect socket, even if network fails.
- **Guard order (root `_layout.tsx`)**: `booting -> splash`, `anonymous -> / (auth)/login`, `mustChangePassword -> / (auth)/change-password`, `onboarding pending -> / (auth)/onboarding`, `ready -> /(app)/*`. Cannot bypass with back navigation (stack `gestureEnabled:false` for sensitive screens).

## Onboarding (mandatory PFP)

`/(auth)/onboarding`:
- Gallery (`expo-image-picker` `launchImageLibraryAsync`) and Camera (`launchCameraAsync`) with square crop (`allowsEditing: true`, `aspect: [1,1]`).
- Permissions via `requestMediaLibraryPermissionsAsync` / `requestCameraPermissionsAsync`; denied shows retry/open-settings message, no crash.
- Normalize to backend-compatible `512x512` JPEG via `expo-image-manipulator` quality ladder `0.9->0.2`, target `<200 KB` (backend `<250k`). `POST /api/rvb/auth/onboarding` `{ profilePicture: data:image/jpeg;base64,... }`. `onboardingStatus === pending` blocks workspace.

## Navigation & roles

- **Expo Router** entry `expo-router/entry` (see `package.json` `main`). `app/_layout.tsx` root guard, `app/(auth)/_layout.tsx` stack, `app/(app)/_layout.tsx` tabs.
- **Roles**: shared type/constants `src/types/rvb.ts`, `src/constants/roles.ts`: `manager | admin | supervisor | worker | supplier | customer` (never `accountant`, `co-manager`). Helpers `isManagementRole()`, `isPortalRole()`, etc.
- **5-tab secondary-role shell** for `worker | supplier | customer` (and routable for management foundation): `Main Chats | Secondary Chats | Profile + Management | Search | Settings`. `initialRouteName="profile"` so Worker (and supplier/customer per contract) lands on **Profile + Management** after auth/onboarding. Tabs are real navigable routes with honest foundation content (no fake salary/balance/chat data).
- **Profile + Management** (`/(app)/profile`): calls real `GET /api/rvb/portal/me` and shows PFP, `displayName`, `@tag`, `role`, linked entity metadata safely.
- **Settings** (`/(app)/settings`): account summary, `PATCH /api/rvb/auth/preferences` `ui.language` (`en|fr|ar`) wiring, theme placeholder, env + socket info, working **Logout**.
- **i18n foundation**: `src/i18n/` with `en|fr|ar` locales, `t()` helper, RTL readiness via `isRTL()` (AR).

## API client

`src/api/config.ts` validates `EXPO_PUBLIC_RVB_API_URL` at startup. `src/api/client.ts` (`rvbRequest`, `api.get/post/patch/...`):
- `baseURL` from env, `Content-Type: application/json`, `X-RVB-Client: native`, `Authorization: Bearer <access>` when present.
- Never `credentials: include`.
- Handles JSON/non-JSON, network/timeout, 400/401/403/404/409/422/423/429/500 with structured `RvbApiError { status, code, message, data }` (never collapses to "Something went wrong").
- 401 refresh dedupe + single retry.
- Socket foundation `src/services/socket.ts`: `io(origin, { path: "/api/rvb/chats/socket", auth: { token } })`, no `?token=` query, `connect/disconnect/reconnect` + immediate disconnect on logout/revoked.

## Project structure (foundation)

```
app/
  _layout.tsx               // root auth guard + splash/api-url validation
  index.tsx                 // -> /(app)/profile
  (auth)/_layout.tsx
  (auth)/login.tsx
  (auth)/change-password.tsx
  (auth)/onboarding.tsx
  (app)/_layout.tsx         // 5 tabs, initialRouteName="profile"
  (app)/main-chats/index.tsx
  (app)/secondary-chats/index.tsx
  (app)/profile/index.tsx
  (app)/search/index.tsx
  (app)/settings/index.tsx
src/
  api/{config,client}.ts
  stores/auth-store.ts       // zustand single source (booting|anonymous|authenticated)
  services/{secure-store,socket}.ts
  types/rvb.ts
  constants/{roles,config}.ts
  utils/{tag,auth-gate,format,image}.ts
  components/common/{Screen,Loading,ErrorState,Empty,Button,Input,Avatar}.tsx
  hooks/useAuth.ts
  theme/
  i18n/
```

No imports from `H.S.H frontend`, `Dexie`, browser DB, `H.S.H repositories/components/services`. Mobile communicates only via R.V.B contract.

## Commands

```bash
npx tsc --noEmit          # strict TS must PASS
npx expo-doctor            # 21/21 must PASS
npx expo export --platform web   # web bundle validation
npx tsx scripts/test-foundation.ts   # unit tests: tag, auth gate, roles, dedupe
npx tsx scripts/test-rvb-contract.ts # optional: live contract matrix against localhost backend (requires running backend)
```

## QA accounts (isolated, disposable)

Created in backend QA DB with `scripts/create-mobile-qa.ts` (password `Mobile123!` for all, not production):

- `qa.worker.mobile` / worker / pending? complete / -> worker-r484-xrac
- `qa.supplier.mobile` / supplier / -> sup-r484-b8c3
- `qa.customer.mobile` / customer / -> cust-r484-2mfc
- `qa.supervisor.mobile` / supervisor / -> worker-rcfk-52h5
- `qa.admin.mobile` / admin
- `qa.manager.mobile` / manager
- `qa.onboard.mobile` / worker pending (onboarding test)
- `qa.pwd.mobile` / worker mustChangePassword (forced password test)

Never alter `@abattoire` or production manager.

## Security checklist (foundation)

- [x] refresh token only SecureStore (`rvb.refreshToken`)
- [x] access token memory only, no console.log
- [x] no AsyncStorage token
- [x] no hard-coded production API URL
- [x] no client-controlled `linkedEntityId`
- [x] no Dexie/AsyncStorage auth
- [x] X-RVB-Client: native, auth:{token} for socket (no query token)

## Current phase

**Foundation only.** Auth, secure session, onboarding, role routing, 5-tab shell, API client, socket foundation are stable and tested. Worker/Supplier/Customer business features (salary, balance, orders, chat UI, directory, notifications, activity, PDF) are intentionally minimal/honest shells (no fake data) for next phases.

## Docs

- Contract: `H.S.H-V2.0.0/RVB-MOBILE-CONTRACT.md`
- Expo SDK 57 docs: https://docs.expo.dev/versions/v57.0.0/
- Expo Router: https://docs.expo.dev/router/introduction/
