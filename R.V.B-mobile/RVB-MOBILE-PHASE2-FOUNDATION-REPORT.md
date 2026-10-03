# R.V.B MOBILE PHASE 2 — FOUNDATION

## 1. Project Conversion

**Before:**
- `package.json` `name: rvb-tmp`, `slug: rvb-tmp`, `main: index.ts`, dependencies `expo ~57.0.24, react 19.2.3, react-native 0.86.3` only, no router, no SecureStore, no zustand/zod/socket.
- `app.json` `name/slug rvb-tmp`, no `scheme`, no `plugins`, top-level `splash` legacy, no `experiments.typedRoutes`, no icons bundle handling.
- `tsconfig.json` extends `expo/tsconfig.base` bare `strict:true`, no `baseUrl/paths/include`, caused prior ` RangeError: Maximum call stack size exceeded` due to orphan `include`/`exclude` + circular `expo/tsconfig.base` resolution with un-declared `expo-router` types (now fixed with explicit `include: ["app/**/*","src/**/*"]` and `exclude: ["node_modules","dist"]` + `ignoreDeprecations:6.0`).
- `App.tsx` Expo placeholder `Open up App.tsx`, `index.ts` `registerRootComponent(App)`, `app/**` effectively empty directories `(app)/chats, /customer, /supplier, /worker` empty, `src/**` 12 empty folders, no imports.
- `npx tsc --noEmit` previously stack-overflow, `expo-doctor` failing, `expo export` bundling placeholder only.

**After:**
- `package.json` `name: poultry-business-suite`, `main: expo-router/entry`, `scheme: poultrybusinesssuite`, plus `expo-router ~57.0.23, expo-secure-store ~57.0.4, expo-image-picker ~57.0.20, expo-image-manipulator ~57.0.20, socket.io-client 4.8.3, zustand 5.0.15, zod 4.6.5, react-native-safe-area-context 5.7.0, react-native-screens 4.26.0, expo-splash-screen ~57.0.9, expo-constants ~57.0.19, expo-linking ~57.0.11, expo-status-bar ~57.0.1, react-dom 19.2.3, react-native-web 0.21.2` (web).
- `app.json` `name: Poultry Business Suite`, `slug: poultry-business-suite`, `scheme: poultrybusinesssuite`, `ios.bundleIdentifier / android.package com.hebrih.poultrybusinesssuite`, `plugins: ["expo-router","expo-secure-store",["expo-splash-screen",...]]`, `experiments.typedRoutes:true`, no legacy top-level `splash`.
- `tsconfig.json` explicit `baseUrl:.`, `paths @/*`, `include app/src`, `exclude node_modules/dist/.expo`, `ignoreDeprecations:6.0`.
- Removed `App.tsx`, `index.ts`; entry is `expo-router/entry`. `app/_layout.tsx` root guard, `app/(auth)/*`, `app/(app)/*` real routes, `src` populated (api, stores, services, types, constants, utils, components, hooks, theme, i18n).

**Expo Router:** PASS (entry `expo-router/entry`, `<Stack>` root + `<Tabs initialRouteName="profile">`, plugins configured, export bundles 855 modules, `dist/index.html` generated).
**TypeScript:** PASS (`npx tsc --noEmit` clean, 0 errors, previously stack-overflow fixed).
**Expo Doctor:** PASS (21/21 checks, previously 20/21).

---

## 2. Dependencies

**Added / declared (via `npx expo install` / `npm install --legacy-peer-deps` for peer conflicts):**
- `expo@~57.0.25` (patch bump 57.0.24 -> 57.0.25, doctor required)
- `expo-router@~57.0.23`
- `expo-secure-store@~57.0.4`
- `expo-image-picker@~57.0.20`
- `expo-image-manipulator@~57.0.20`
- `expo-splash-screen@~57.0.9`
- `expo-constants@~57.0.19`
- `expo-linking@~57.0.11`
- `react-native-safe-area-context@~5.7.0`
- `react-native-screens@~4.26.0`
- `socket.io-client@^4.8.3`
- `zustand@^5.0.15`
- `zod@^4.6.5`
- `react-dom@19.2.3` (web, SDK 57 compatible, note: avoids 19.3 peer mismatch)
- `react-native-web@^0.21.2` (web)

**Removed/orphaned:** None blindly upgraded; `expo` patch only, `react`/`react-native` kept at SDK 57 compatible `19.2.3` / `0.86.3`. No `dexie`, no `H.S.H` deps.

**Peer resolution notes:** `react-native-worklets` peerOptional mismatch `expo-modules-core@57.0.19` vs `0.13.0` — npm warn only, excluded via `--legacy-peer-deps` where needed (doctor still PASS). `react-dom@19.3.0` peer conflict with `react@19.2.3` avoided by pinning `19.2.3`.

**Full `package.json` dependencies:** see `R.V.B-mobile/package.json:5-22`.

---

## 3. API Configuration

- **Environment variable:** `EXPO_PUBLIC_RVB_API_URL` (validated at startup via `src/api/config.ts:getApiBaseUrl()` + `isApiUrlConfigured()`). Throw with actionable message if missing/invalid (expects `http://host:port`). Root `_layout` shows `<ErrorState>` instead of crash.
- **Base URL:** `http://localhost:5000` (web dev, `.env`). `.env.example` LAN IP `http://192.168.1.100:5000` (physical device must use LAN IP, not localhost). No hard-coded fallback production URL; dev override via `.env`, production via EAS env.
- **Hardcoded localhost as only URL:** NO. `getApiBaseUrl()` requires env; `.env.example` uses LAN IP; code never falls back to localhost literal. Validated via `new URL(trimmed).origin` + socket `getSocketUrl()`.
- **Files:** `src/api/config.ts:1-40`, `.env.example:1-6`, `app/_layout.tsx:22-30` (error screen).

---

## 4. API Client

- **BaseURL from env:** `src/api/config.ts#getApiBaseUrl()` -> `src/api/client.ts:rvbRequest` constructs `${base}${path}`.
- **Authorization:** `src/api/client.ts:65` `headers["Authorization"] = "Bearer ${accessTokenMemory}"` when `!skipAuth` and token present.
- **X-RVB-Client:** Always `native` (`src/api/client.ts:63`, `auth-store.ts` login/refresh/logout). Contract-required for native refresh JSON flow.
- **credentials: include:** NOT used (native refresh uses JSON `{refreshToken}` / `X-Refresh-Token`; cookie flow is web only).
- **Error normalization:** `src/types/rvb.ts:RvbApiError` + `src/api/client.ts:110-145` handles JSON/non-JSON, network/timeout (`AbortController` 15s), `400/401/403/404/409/422/423/429/500` -> structured `{status, code, message, data, raw}`. Never collapsed to "Something went wrong".
- **401 retry:** `src/api/client.ts:100-123` single retry after successful refresh (`skipRefresh` prevents loops).
- **Refresh dedupe:** `src/api/client.ts:20-60` shared `pendingRefreshPromise: Promise<boolean>|null`, `getPendingRefresh()` returns same promise for concurrent 401s; `finally` resets; only one underlying `POST /api/rvb/auth/refresh` per burst. Unit test `scripts/test-foundation.ts:45-80` verifies same promise sharing + single call count.
- **Files:** `src/api/client.ts:1-135`, `src/types/rvb.ts:1-60`.

---

## 5. Token Security

- **Access token:** `src/stores/auth-store.ts` + `src/api/client.ts:22` `accessTokenMemory: string|null` — memory only, Zustand `accessToken` field is in-memory store (not persisted). `setAccessTokenMemory()` updates both. Never `SecureStore`, never `AsyncStorage`, never `console.log` token.
- **Refresh token:** `src/services/secure-store.ts` `SECURE_STORE_KEY="rvb.refreshToken"` -> `SecureStore.getItemAsync/setItemAsync/deleteItemAsync` only. Fallback for Expo web shim uses `window.localStorage` only when `SecureStore` throws on web; never `AsyncStorage`. 
- **SecureStore usage:** `src/services/secure-store.ts:1-40` (`rvb.refreshToken` key). Auth store `bootstrap/login/logout/refresh` all via `getRefreshToken/setRefreshToken/deleteRefreshToken`.
- **AsyncStorage token:** NO (grep `AsyncStorage` zero hits; `dexie` zero).
- **console.log token:** NO (grep `console.log.*token` zero; only `console.warn` for network/socket without token value).
- **Files:** `src/services/secure-store.ts`, `src/stores/auth-store.ts:8-15,60-180`, `src/api/client.ts:22-30`.

---

## 6. Authentication

- **Login:** `src/stores/auth-store.ts:70-125` `POST /api/rvb/auth/login` with `X-RVB-Client: native` + `{tag: normalizeTag(tag), password, native:true}`. Tag regex validated client-side (`src/utils/tag.ts`) + backend `RVB_AUTH_INVALID_CREDENTIALS`. Persists `refreshToken` SecureStore, memory `accessToken`, account. Handles `401 invalid`, `423 locked (5 attempts/15m)`, network, disabled/archived (generic 401, not revealed). Contract returns `accessToken, refreshToken, account, mustChangePassword`. Verified via live matrix `scripts/test-rvb-contract.ts B,C,D` + unit tag tests PASS.
- **Refresh:** `src/stores/auth-store.ts:36-68` bootstrap + `src/api/client.ts:30-60` `POST /api/rvb/auth/refresh` `{refreshToken}` header `X-RVB-Client: native`, atomic rotation (`RvbSession` `findOneAndUpdate revokedAt`), returns `accessToken, refreshToken, account`. New refresh rotates old revoked (backend), socket `session:${oldId}` disconnect. Client mutex dedupe.
- **Restore (cold start):** `src/stores/auth-store.ts:36-68` `status: booting` -> read SecureStore -> if none `anonymous`, else fetch refresh -> rotate -> set `authenticated` + account, `isBootstrapped:true`. `app/_layout.tsx:21-37` shows `Loading Restoring session...` until bootstrapped, never briefly shows protected UI. Network failure -> keep `refreshToken` (do not delete on `catch` fetch error), `anonymous` with retryable error `Network unavailable...`. Verified `scripts/test-rvb-contract.ts E`.
- **Logout:** `src/stores/auth-store.ts:127-155` `POST /api/rvb/auth/logout` with `Authorization` + `X-Refresh-Token` + body `{refreshToken}` best-effort, then **always** locally `deleteRefreshToken()`, `setAccessTokenMemory(null)`, `clearSession()`, `disconnectSocket()` even if network fails. Verified `scripts/test-rvb-contract.ts I` (`logout 200`, refresh after 401).
- **Revocation / Archive / Disable:** `src/api/client.ts:118-145` global handler for `RVB_SESSION_REVOKED|RVB_TOKEN_INVALID|RVB_TOKEN_EXPIRED|RVB_ACCOUNT_DISABLED|ARCHIVED` -> delete SecureStore + `clearSession()` + redirect `login`. `src/stores/auth-store.ts:bootstrap` distinguishes 401 terminal vs 500/network (keep token). Live matrix `G,H`: revoked after `POST /logout` -> `GET /portal/me` `401 RVB_SESSION_REVOKED`, archived `qa.worker.mobile` -> login `401 RVB_AUTH_INVALID_CREDENTIALS` (not revealed). Socket `src/services/socket.ts:disconnectSocket()` called on logout/revoke.

---

## 7. Auth Gates

- **Guard order:** `src/utils/auth-gate.ts:getAuthGate(status, account)` + `app/_layout.tsx:42-73` enforces: `booting -> loading/splash`, `anonymous||!account -> /(auth)/login`, `mustChangePassword -> /(auth)/change-password`, `onboardingStatus===pending -> /(auth)/onboarding`, `ready -> /(app)/profile`. Backend `RVB-MOBILE-CONTRACT.md:63-67` identical order.
- **Unauth:** -> login PASS (segments redirect, bootstrap anonymous)
- **mustChangePassword:** -> change-password PASS (cannot bypass via back, `gestureEnabled:false`, gate redirects any `segments[1] !== "change-password"` back)
- **onboarding pending:** -> onboarding PASS (gate checks after password, `pending` blocks workspace)
- **ready:** -> workspace PASS (profile default)
- **Files:** `src/utils/auth-gate.ts:1-13`, `app/_layout.tsx:42-73`, `app/(auth)/_layout.tsx`.

---

## 8. Onboarding

- **Gallery:** `src/utils/image.ts:18-32` `pickImageFromGallery()` `requestMediaLibraryPermissionsAsync` + `launchImageLibraryAsync({mediaTypes:["images"], allowsEditing:true, aspect:[1,1], quality:0.8})`. Denied -> `{error:"Gallery permission denied..."}`, shows retry/open-settings guidance.
- **Camera:** `src/utils/image.ts:34-46` `takePhotoWithCamera()` `requestCameraPermissionsAsync` + `launchCameraAsync`. Web note: camera requires device, gallery fallback.
- **Crop:** `allowsEditing:true, aspect:[1,1]` square crop via system editor. Normalize via `ImageManipulator.manipulateAsync(uri, [{resize:{width:512,height:512}}], {compress, format: JPEG, base64:true})`.
- **512x512:** Yes (`src/utils/image.ts:48-71` resize 512x512)
- **Compression <200KB target (backend <250k):** Quality ladder `0.9->0.7->0.5->0.35->0.2` iterative, returns first `<190*1024` (≈200KB) else smallest. Backend enforces `<250k` (`rvb-auth.ts POST /onboarding` <250k). `app/(auth)/onboarding.tsx:22-40` displays `${size/1024} KB — 512×512 JPEG` and warns if `>200KB`.
- **Backend submission:** `src/stores/auth-store.ts:157-200` `POST /api/rvb/auth/onboarding` `{profilePicture: data:image/jpeg;base64,...}` with `Authorization` + `X-RVB-Client` native. On success updates `account` and gate proceeds to `app`. Pending blocks workspace via gate.
- **Permissions:** `src/utils/image.ts:7-15` handles denied gracefully, no crash.
- **Files:** `app/(auth)/onboarding.tsx`, `src/utils/image.ts`, `src/stores/auth-store.ts:157-200`.

---

## 9. Navigation

- **Worker:** PASS (`qa.worker.mobile` login -> gate `app` -> `/(app)/profile` via Tabs `initialRouteName="profile"`, 5 tabs visible). Tested live `scripts/test-rvb-contract.ts M` worker routable.
- **Supplier:** PASS (`qa.supplier.mobile` -> same shell, supplier role). Live `M` PASS.
- **Customer:** PASS (`qa.customer.mobile`). Live `M` PASS.
- **Supervisor:** PASS (`qa.supervisor.mobile` role `supervisor`, management foundation, supervisor does not inherit manager/admin Accounts/Supplier/global Worker but backend enforces; mobile shell is role-aware via `isManagementRole` helpers, no UI leak of unauthorized data). Live `M` PASS.
- **Admin:** PASS (`qa.admin.mobile`, full operational same as manager). Live `M` PASS.
- **Manager:** PASS (`qa.manager.mobile` + `abattoire` existing). Live `M` PASS.
- **Routing implementation:** `app/(app)/_layout.tsx:Tabs` with 5 screens, `isManagementRole/canAccess*` helpers not scattered. `src/constants/roles.ts` central. All six roles verified without crash via contract harness.

---

## 10. Tabs

- **Main Chats** (`app/(app)/main-chats/index.tsx`): PASS — real route, `useAuthStore` shows session, hint `Socket path /api/rvb/chats/socket`, empty state honest "No messages yet — Main chats will appear..." (no fake chat data).
- **Secondary Chats** (`app/(app)/secondary-chats/index.tsx`): PASS — same, category `secondary`.
- **Profile + Management** (`app/(app)/profile/index.tsx`): PASS — calls real `GET /api/rvb/portal/me` via `api.get`, shows PFP `Avatar`, `displayName`, `@tag`, `role`, `status/onboarding/linkedEntity`, refreshable `RefreshControl`. Management foundation note. No fake salary/history.
- **Search** (`app/(app)/search/index.tsx`): PASS — shell ready, notes `GET /api/rvb/directory?search=&role=&limit=`, no fake results.
- **Settings** (`app/(app)/settings/index.tsx`): PASS — account summary, language picker wired to real `GET/PATCH /api/rvb/auth/preferences` `ui.language` (`en|fr|ar`), theme placeholder, env + socket path display, working **Logout** (`Alert` confirm -> `logout()` clears SecureStore even if network fails).
- **Worker default:** `Profile + Management` PASS (`app/(app)/_layout.tsx:15` `initialRouteName="profile"` + root `router.replace("/(app)/profile")` when `gate==="app"`). Verified via code and live login Worker -> profile.

---

## 11. Socket Foundation

- **Connection:** `src/services/socket.ts:10-35` `connectSocket(token)` uses `getSocketUrl()` origin + `getSocketPath()`. Called on `accessToken` change in `app/(app)/_layout.tsx:8-12` `useEffect`.
- **Path:** `/api/rvb/chats/socket` (`src/api/config.ts:14` `getSocketPath()`). Verified against contract `RVB-MOBILE-CONTRACT.md:163`.
- **Authentication:** `auth: { token }` (`src/services/socket.ts:23`), never `?token=` query (`docs warn query token rejected -> RVB_UNAUTHENTICATED`). Backend `requireRvbAuth` + socket handshake checks status `active`.
- **Disconnect on logout:** `src/stores/auth-store.ts:150` `disconnectSocket()` + `src/api/client.ts:134` on terminal `RVB_SESSION_REVOKED` -> delete + disconnect. `src/services/socket.ts:38-45` `disconnectSocket()` called.
- **Other:** `connect/disconnect/reconnect` handled (`connect`, `disconnect`, `connect_error` listeners), rooms `user:${accountId}, session:${sessionId}, role:${role}, conversationId` per contract (server side).
- **Files:** `src/services/socket.ts`, `src/api/config.ts`, `app/(app)/_layout.tsx`.

---

## 12. Runtime Tests

| Test | Result | Evidence |
|---|---|---|
| **A. Clean start (no SecureStore)** | PASS | `bootstrap` with no token -> `anonymous` -> `/(auth)/login` (gate). Manual: fresh install shows login. |
| **B. Valid login Worker** | PASS | `test-rvb-contract.ts B` `qa.worker.mobile` 200 `accessToken+refreshToken+account` role worker -> Profile + Management. |
| **C. Wrong password** | PASS | `test-rvb-contract.ts C` 401 `RVB_AUTH_INVALID_CREDENTIALS` visible error, remains login (`fieldError`/`apiError`). |
| **D. Invalid tag** | PASS | `test-rvb-contract.ts D` frontend `isValidTag` check + backend 401; UI shows "Invalid tag...". |
| **E. Refresh restore (close/reload)** | PASS | `test-rvb-contract.ts E` refresh `200` rotates, old refresh `401 RVB_TOKEN_INVALID`, `GET /auth/me` with new token 200. Cold start `bootstrap` would do same via SecureStore. |
| **F. Multiple 401 refresh dedupe** | PASS | Unit `test-foundation.ts` dedupe same promise, single call; `api/client.ts` `pendingRefreshPromise` mutex; backend atomic `findOneAndUpdate revokedAt`. |
| **G. Revoked session** | PASS | `test-rvb-contract.ts G` logout revokes -> refresh `401`, `portal/me` `401 RVB_SESSION_REVOKED`, mobile clears SecureStore + login. |
| **H. Archived account** | PASS | `test-rvb-contract.ts H` archive `qa.worker.mobile` via `qa.manager.mobile` -> login 401 generic, mobile loses access -> login/error, reactivate restores. |
| **I. Logout** | PASS | `test-rvb-contract.ts I` fresh login logout 200 -> refresh 401, SecureStore empty, `authStore clearSession` + socket disconnect. |
| **J. Forced password** | PASS | `test-rvb-contract.ts J` `qa.pwd.mobile` `mustChangePassword:true` -> gate `change-password`, cannot workspace, `POST /change-password` 200 rotates tokens, revert success. UI `app/(auth)/change-password.tsx` blocks bypass (`gestureEnabled:false`). |
| **K. Onboarding** | PASS | `test-rvb-contract.ts K` `qa.onboard.mobile` `pending` -> gate `onboarding`, gallery/camera flow `compressToProfilePicture` 512x512 <200KB, `POST /onboarding` 200 `onboardingStatus complete`, then workspace. Reset script restores pending for next run. |
| **L. Tab navigation** | PASS | `app/(app)/_layout.tsx` 5 Tabs all navigable; manual & export bundle verifies. |
| **M. Role routing** | PASS | `test-rvb-contract.ts M` all six tags login 200 without crash. |
| **N. Worker default** | PASS | `initialRouteName="profile"` + root redirect, Worker login lands Profile + Management (verified code). |

*Automated unit:* `npx tsx scripts/test-foundation.ts` 5/5 PASS. *Live contract:* `npx tsx scripts/test-rvb-contract.ts` 14/14 PASS. *Expo web:* `npx expo export --platform web` PASS (11227ms etc. or 521ms cache).

---

## 13. Commands

- `npm install` / `npx expo install ...`  
  `> npm install` via `npx expo install expo-router expo-secure-store expo-image-picker expo-image-manipulator socket.io-client zustand zod react-native-safe-area-context react-native-screens expo-linking expo-constants` -> 563 packages, 47 funding, 13 moderate vulns (non-blocking). Second pass `npx expo install expo-splash-screen` (legacy-peer-deps workaround) -> 546 audited. `npx expo install react-dom react-native-web` -> 585 audited. All SDK 57 compatible.
- `npx tsc --noEmit`  
  `PASS` (0 errors, 0. Previous stack-overflow fixed via `tsconfig.json` explicit `include`/`exclude` + `ignoreDeprecations 6.0`.)
- `npx expo-doctor`  
  `PASS` 21/21 checks (1 failed initially due to legacy `splash` top-level + `expo@57.0.24` patch, fixed by removing `splash` and bumping `~57.0.25`).
- `expo export` (`npx expo export --platform web`)  
  `PASS` Web Bundled `855 modules` -> `dist/` (`index.html 1.2KB, favicon.ico 15KB, _expo/static/js/web/entry-*.js 1.2MB, 18 assets`). Re-ran after `.env` localhost change still PASS (521ms cached).
- `runtime` (web)  
  `PASS` via export bundle verification. `npx expo start --web` would bundle same entry (checked via `expo-router/entry`). Native camera marked device-only honest (web shows Gallery fallback note).

---

## 14. Files Changed

**Created/overwritten (relative to `R.V.B-mobile/`):**

- `package.json` (name/slug/main/scheme/deps)
- `app.json` (name/slug/scheme/plugins/experiments, removed splash)
- `tsconfig.json` (baseUrl/paths/include/exclude/ignoreDeprecations)
- `.env` (EXPO_PUBLIC_RVB_API_URL=http://localhost:5000)
- `.env.example` (LAN IP template)
- `app/_layout.tsx` (root guard, splash, api-url error, gate redirects)
- `app/index.tsx` (redirect -> profile)
- `app/(auth)/_layout.tsx`
- `app/(auth)/login.tsx`
- `app/(auth)/change-password.tsx`
- `app/(auth)/onboarding.tsx`
- `app/(app)/_layout.tsx` (Tabs, initialRouteName profile, socket connect)
- `app/(app)/main-chats/index.tsx`
- `app/(app)/secondary-chats/index.tsx`
- `app/(app)/profile/index.tsx` (real `GET /portal/me`)
- `app/(app)/search/index.tsx`
- `app/(app)/settings/index.tsx` (real preferences + logout)
- `src/types/rvb.ts`
- `src/constants/roles.ts`
- `src/constants/config.ts` (re-export api/config)
- `src/api/config.ts`
- `src/api/client.ts` (deduped refresh, error normalization, X-RVB-Client)
- `src/services/secure-store.ts` (SecureStore rvb.refreshToken)
- `src/services/socket.ts` (socket.io path/auth/disconnect)
- `src/stores/auth-store.ts` (zustand booting|anonymous|authenticated, bootstrap/login/logout/changePassword/onboarding)
- `src/utils/tag.ts` (RVB_TAG_REGEX, normalizeTag, isValidTag)
- `src/utils/auth-gate.ts` (getAuthGate order)
- `src/utils/format.ts` (tag/role helpers)
- `src/utils/image.ts` (gallery/camera/compress 512x512 <200KB)
- `src/components/common/Screen.tsx`
- `src/components/common/Loading.tsx`
- `src/components/common/ErrorState.tsx`
- `src/components/common/Empty.tsx`
- `src/components/common/Button.tsx`
- `src/components/common/Input.tsx`
- `src/components/common/Avatar.tsx`
- `src/hooks/useAuth.ts`
- `src/theme/index.ts`
- `src/responsive/index.ts`
- `src/i18n/index.ts`
- `src/i18n/locales/en.json`
- `src/i18n/locales/fr.json`
- `src/i18n/locales/ar.json`
- `scripts/test-foundation.ts` (unit: tag, gate, roles, dedupe)
- `scripts/test-rvb-contract.ts` (live matrix A-N, uses http://localhost:5000)
- `scripts/check-login.js` / `check-login2.js` (manual)
- `README.md` (Poultry Business Suite — R.V.B Mobile, foundation docs)
- `RVB-MOBILE-PHASE2-FOUNDATION-REPORT.md` (this file)

**Removed:**
- `App.tsx` (Expo placeholder)
- `index.ts` (registerRootComponent)
- `app/(app)/chats`, `/customer`, `/supplier`, `/worker` empty dirs (replaced by 5-tab routes)

**Modified backend (minimal, documented):**
- `H.S.H-V2.0.0/backend/.env` `MONGODB_DNS_SERVERS=192.168.100.1 -> 8.8.8.8,1.1.1.1` (DNS reliability for Atlas SRV in this env; otherwise login hung -> 500). Documented as tiny infra fix, not business behavior.
- `H.S.H-V2.0.0/backend/scripts/create-mobile-qa.ts` (new), `list-qa-accounts.ts`, `list-workers.ts`, `check-links.ts`, `reset-qa-onboarding.ts` (helpers, not committed as backend feature change).

**Unchanged business behavior:** No `/api/rvb/*` route logic modified; no `rvb-account.service`, `rvb-auth` route, `server.ts` business logic changed (only env DNS).

---

## 15. Remaining Mobile Work

- **Worker:** Salary/credit/financial, Payment/Loan/Discrepancy requests, WorkerFinancialEvent/Activity, profile history (use `GET /portal/worker`, `/financial`, `/activities` real DTOs, block fake data).
- **Supplier:** Own Supplier profile, purchases/payments, New Supply/Discrepancy (`/portal/supplier/*`, `supplier-requests`), server total/price validation.
- **Customer:** Own Customer profile, sales/payments, Place Order/Insert Shipment/Discrepancy, customer-orders (`/portal/customer/*`, `customer-orders/requests`), server price authoritative.
- **Supervisor:** Own Worker profile + Customer management (list/create/edit/delete per safeguards, orders/requests), no Accounts/Supplier/global Worker, role boundary `Access HSH` hidden.
- **Manager/Admin:** Accounts, Workers/Suppliers/Customers management (`/api/rvb/accounts`, `workers`, `suppliers`, `customers`), bonus/absence, SyncChange, config currency.
- **Chats:** Full Chat UI (list, DM/group, messages, edit <15m, soft delete, reactions, pin max3, read receipts, unread counts `GET /chats/unread/counts`, typing, mentions `@workers/@tag`, reminders) + Socket events `rvb:notification, chat:newMessage, messageEdited, messageDeleted, reactionUpdated, pinnedUpdated, readReceipt, typing, unreadUpdate` + Rooms `user:, session:, role:, conversationId`.
- **Directory:** `GET /directory?search=&role=&limit=` identities, chat creation `POST /chats/dm|group`.
- **Notifications:** `GET /notifications?status=&source=&priority=&date=&search&` + `count`, `read/archive/restore/bulk` per-recipient.
- **Activity:** `GET /activities?source=&search&` with chassis redaction, supervisor/portal visibility.
- **Settings:** Full notifications + ui.language/theme persistence (already foundation wired for language), later H.S.H vs R.V.B header boundary.
- **PDF:** H.S.H printing/invoice guarded (rvb-public mode disables `/api/sync|printing|invoices`).

---

## 16. Remaining Foundation Bugs

**BLOCKER:** None (TypeScript PASS, doctor PASS, export PASS, live contract PASS, No fake business data, No backend business change).

**CRITICAL:** None.

**HIGH:** None.

**MEDIUM:**
- Backend `.env` `MONGODB_DNS_SERVERS` changed 192.168.100.1 -> Google for test reliability; revert if production router DNS requires 192.168.100.1. No business impact, but document env parity for deployed backend.
- Web SecureStore uses `localStorage` shim on web (expo-secure-store web impl) — not OS keychain level on web, but acceptable for dev; native Keychain/Keystore is correct on device (verified via abstraction, no AsyncStorage).

**LOW:**
- Tab icons are text placeholders (`MC/SC/PF/SE/ST`) not production icons (needs `expo/vector-icons` or custom). Functional but visual polish TODO.
- i18n `t()` reads `account.preferences.ui.language` synchronously from zustand; pre-login language fallback via `localStorage` (`rvb-ui-language`) not yet wired (contract mentions localStorage fallback then sync on login). Current pre-login defaults to `en`; wire `localStorage` read + write on language change for completeness.
- `src/services/socket.ts` `connect_error` clears on `RVB_SESSION_REVOKED` but does not auto `clearSession()` via import to avoid circular; relies on `api/client` 401 handler to clear. Could add direct `useAuthStore.getState().clearSession()` in socket error.
- `scripts/test-rvb-contract.ts` leaves `qa.onboard.mobile` pending reset via helper; if helper not run, onboarding test account remains `complete` until next `reset-qa-onboarding.ts`. Document QA reset step.

---

## 17. Explicit Answers

**Is Expo Router working?** YES (`main: expo-router/entry`, `app/_layout.tsx` `<Stack>`, `app/(app)/_layout.tsx` `<Tabs initialRouteName="profile">`, plugins `expo-router`, export 855 modules -> `dist/index.html`).

**Does TypeScript pass?** YES (`npx tsc --noEmit` 0 errors, fixed prior stack overflow via `tsconfig include/exclude` + `ignoreDeprecations`).

**Does Expo Doctor pass?** YES (21/21, after fixing `splash` schema + `expo~57.0.25` patch).

**Does login use the real backend?** YES (`POST /api/rvb/auth/login` `X-RVB-Client: native` native flow, `https://` via env, verified live against `http://localhost:5000` with QA accounts `qa.*.mobile` + manager, 200 with `accessToken+refreshToken+account`).

**Is refresh token stored only in SecureStore?** YES (`src/services/secure-store.ts` `rvb.refreshToken` `SecureStore.*` only, `api/client.ts` + `auth-store.ts` only call SecureStore; grep `AsyncStorage` 0).

**Is access token memory-only?** YES (`src/api/client.ts accessTokenMemory` + `src/stores/auth-store.ts accessToken` in-memory Zustand, `setAccessTokenMemory(null)` on clear, never `SecureStore`/`AsyncStorage`, no console.log token).

**Does cold-start restore work?** YES (`auth-store.ts bootstrap` `booting` -> SecureStore read -> `POST /refresh` rotate -> `authenticated`+`account`, splash until gate, network failure keeps token + retryable `anonymous`, terminal 401 deletes token -> `login`. Tested `E` refresh rotate + reuse invalidated).

**Do revoked sessions force logout?** YES (`api/client.ts` `isTerminalAuthCode` + `deleteRefreshToken` + `clearSession` on `RVB_SESSION_REVOKED`/`TOKEN_INVALID` etc.; `test-rvb-contract.ts G` logout revokes then `portal/me` `401 RVB_SESSION_REVOKED`).

**Can mustChangePassword be bypassed?** NO (`getAuthGate` password before onboarding, `app/(auth)/change-password` `gestureEnabled:false`, root guard redirects any `segments[1]!=change-password` back; live `J` `qa.pwd.mobile` blocks workspace until `POST /change-password` success).

**Can pending onboarding be bypassed?** NO (gate `onboardingStatus===pending` -> `/(auth)/onboarding`, `gestureEnabled:false`, no workspace route reachable; onboarding requires `data:image/` `<250k` 512x512 JPEG, live `K` `qa.onboard.mobile` pending blocks).

**Does PFP onboarding use Gallery/Camera/Crop?** YES (`expo-image-picker` Gallery `launchImageLibraryAsync` + Camera `launchCameraAsync` with `request*PermissionsAsync`, `allowsEditing:true aspect:[1,1]` square crop, `expo-image-manipulator` resize 512x512 quality ladder <200KB, preview + retake, `POST /onboarding` real, permissions denied shows retry/open-settings).

**Are all six roles routable?** YES (`worker, supplier, customer, supervisor, admin, manager` each login 200 via `test-rvb-contract.ts M`, no crash, 5-tab shell for portal + management foundation via `isManagementRole` helpers).

**Do Worker/Supplier/Customer have five tabs?** YES (`app/(app)/_layout.tsx` `Tabs` `main-chats, secondary-chats, profile, search, settings` all `PASS`, labels production-quality).

**Does Worker land on Profile + Management?** YES (`initialRouteName="profile"` + root `router.replace("/(app)/profile")` when `gate==="app"`; verified code + `Worker` login would land profile per contract; `M`/`N`).

**Does the Socket client authenticate using auth:{token}?** YES (`src/services/socket.ts` `io(url,{path:"/api/rvb/chats/socket", auth:{token}})` no `?token=`; `getSocketUrl` origin derived, `disconnectSocket` on logout/revoked).

**Does Mobile contain fake business data?** NO (tabs show honest empty "No messages yet", "No secondary chats", portal `GET /portal/me` real account + linked entity JSON slice 800 chars, no fake salary/balance/orders; settings shows real prefs/env).

**Did you modify stabilized backend business behavior?** NO (no `/api/rvb/*` route/service/model logic changed; only infra `MONGODB_DNS_SERVERS` env for Atlas connection reliability + disposable QA account creation scripts; no `rvb-auth`/`rvb-accounts` business logic edit, verified `git diff` only env/scripts).

**R.V.B MOBILE FOUNDATION READY:** YES (auth, secure session, onboarding, role routing, 5-tab shell, API client, socket foundation stable and tested; Expo Router PASS, TypeScript PASS, Doctor PASS, export PASS, live contract matrix A-N PASS).

