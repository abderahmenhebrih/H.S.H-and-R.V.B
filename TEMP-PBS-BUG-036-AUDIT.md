# TEMP-PBS-BUG-036-AUDIT (PBS-BUG-036 — Expo-Web refresh token in localStorage)

Cycle scope: PBS-BUG-036 ONLY. PRE-FIX baselines are cycle-start worktree
snapshots (mobile path is a superproject gitlink: no git blobs exist for
`R.V.B-mobile` — see sec 17). PBS-BUG-032/034/035 are CLOSED and preserved
untouched (sec 69-70).

## 1. Bug definition

On Expo Web, `SecureStore` calls always throw (web module is `{}`), so the
project wrapper fell back to persisting the server-issued long-lived refresh
token in `window.localStorage["rvb.refreshToken"]` — JavaScript/XSS-readable.
The mobile stack additionally used native protocol identity (`X-RVB-Client:
native` + JSON `{refreshToken}` body) on web, so the backend minted native
sessions returning the token in JSON.

## 2. Re-audit claim

Statically CONFIRMED at cycle start (secure-store.ts:26-39 fallback writes);
runtime-reproduced pre-fix at module level (fingerprint `match=true`) AND in
real Chromium (`readable=true`, `match=true`). Decision CASE 2.

## 3. Current secure-store source

Pre-fix 58 lines / post-fix 64 lines (full bodies sec 42-43). Pre-fix: every
method tried SecureStore then fell back to localStorage on web. Post-fix:
`isWebPlatform()` branch FIRST — get→null, set→no-op, delete→legacy-key
removal only; native paths byte-semantics preserved; dead localStorage
fallbacks removed.

## 4. Expo SecureStore actual web behavior

Installed `expo-secure-store@57.0.4`: `build/ExpoSecureStore.web.js` is
literally `export default {};`. Therefore on Expo Web `getValueWithKeyAsync`
(and set/delete counterparts) do not exist → every call throws TypeError →
project wrapper's catch ran the localStorage fallback on EVERY web call.
`isAvailableAsync()` would report false on web. Runtime proof: pre-fix web
login left the token in localStorage (sec 21) while android used SecureStore
(sec 26). Closure invariant enforced post-fix: web never calls SecureStore
for refresh credentials at all (web-first branch), so future package changes
cannot reintroduce browser persistence.

## 5. Current auth-store architecture

Pre-fix `auth-store.ts` (357 lines): BOOTSTRAP gated on `getRefreshToken()`
then native-protocol refresh POST (`X-RVB-Client`, `{refreshToken}` body);
LOGIN always native (`X-RVB-Client` + `native:true` body), persisting any
returned `refreshToken`; CHANGE-PASSWORD native headers, conditional persist;
LOGOUT best-effort (header+body token) then local wipe + socket disconnect;
terminal 401 → delete + clear. Post-fix (379 lines): `isWebPlatform()`
branches in bootstrap/login/logout/change-password; web uses cookie protocol
(no native identity, `credentials:include`, `{}` bodies); response handling
shared and unchanged; onboarding/refreshProfile read-headers left inert (they
never mint credentials — documented in sec 34/38).

## 6. Current API-client architecture

Pre-fix `client.ts` (223 lines): default JSON + `X-RVB-Client: native`
headers, Bearer from memory, NO credentials option anywhere, shared
`pendingRefreshPromise` mutex, `performRefresh()` native body-token POST,
conditional rotation persist, 401 single-retry with terminal cleanup, dynamic
auth-store sync. Post-fix (229 lines): `performRefresh()` branches ONLY its
request construction on `isWebPlatform()` (no header/body-token + include on
web); ALL response handling — 401/5xx/terminal/success/store-sync — shared
byte-identical. No other client behavior changed.

## 7. Native-vs-web backend contract

Current `backend/src/routes/rvb-auth.ts` (+ session model), verified by
source AND runtime:

| | LOGIN | REFRESH | CHANGE-PASSWORD | LOGOUT |
|---|---|---|---|---|
| WEB (no native header) | `clientType=web`; HttpOnly cookie set; JSON has access+account, NO refreshToken | cookie accepted; rotates cookie; JSON has access+account only | rotation from trusted session metadata; new cookie; no JSON token | revoke by cookie hash (or Bearer fallback); `clearCookie` |
| NATIVE (`X-RVB-Client: native`) | `clientType=native`; cookie ALSO set; JSON ADDS refreshToken | body/header explicit token REQUIRED (header alone insufficient); rotates; JSON adds refreshToken | same rotation; JSON adds refreshToken for native sessions | revoke by body/header token or Bearer; clears cookie too |

Native detection: header ONLY (`isNativeLoginRequest`, line 99-101; body
`native:true` inert). Refresh/change-password trust `session.clientType`
from metadata, never headers. Rotation: atomic revoke + same familyId.

## 8. Session clientType semantics

Fixed at login from the request header; preserved across refresh rotation
from trusted session metadata; consulted (not the request header) when
deciding JSON refreshToken responses. Mobile web logins (no header) therefore
stay `web` forever; native stays `native`. No mixed sessions observed.

## 9. Cookie contract/security flags

`rvb_refresh_token`: `HttpOnly: true`, `SameSite: "lax"`, `Secure: isProd`
(false on dev http), `Path: /`, `MaxAge: refresh TTL`. Clearing uses the same
flags + expiry. Browser proof (sec 53): `httpOnly=true sameSite=Lax
secure=false path=/`, invisible to `document.cookie`.

## 10. Web frontend reference

`frontend/src/services/rvb-auth.service.ts`: login sets memory access +
session hint, ignores JSON token; `doRefreshRequest` cookie POST
`credentials:include` with `{}` body; hard-reload restore via gated refresh;
logout revokes + clears. REFERENCE ONLY — byte-untouched.

## 11. Mobile contract requirements

`RVB-MOBILE-CONTRACT.md`: web login sets HttpOnly cookie, NO refresh JSON
(:31); native requires header + explicit token (:32,38,47); refresh web =
cookie, native = explicit token (:37-38); rotation preserves family+type
(:39); token storage (:69-72): refresh → secure OS storage
(Keychain/Keystore, expo-secure-store), NEVER AsyncStorage/plain storage;
access → memory (+secure); SESSION_REVOKED → clear + re-login; :202 no
AsyncStorage for refresh. The contract never blesses localStorage; the fix
implements exactly this split per platform.

## 12. Expo-Web support proof

`package.json`: `web` script + `react-native-web` + `expo-router`;
`app.json`: `web.bundler: metro` + favicon; 034 cycle ran
`expo export --platform web` successfully; this cycle built AND drove the
bundle in real Chromium through login/search/reload/logout flows. Web is a
real supported runtime with authenticated usage — CASE 2 (not a
preview-only target).

## 13. Complete token-storage caller inventory

Refresh-credential callers (all): auth-store bootstrap:45,401-handler:86,
terminal:110,success:127,login:176,logout-get:197,logout-finally:214,
changePassword:259,refreshProfile:348; client performRefresh:33,
401-cleanup:58,terminal-cleanup:68,rotation:76,401-retry-cleanup:177,
terminal-cleanup:193,199. Non-secret localStorage: ThemeProvider theme mode
only. No sessionStorage/AsyncStorage/IndexedDB credential use anywhere.
Socket (`services/socket.ts`) uses memory access token only — no refresh
credential path.

## 14. Complete browser-storage inventory

Pre-fix Chromium after login: localStorage=`["rvb.refreshToken"]`,
sessionStorage=`[]`, `document.cookie=""`, IndexedDB DBs=`[]`.
Post-fix: localStorage=`[]`, sessionStorage=`[]`, `document.cookie=""`
(cookie HttpOnly), IndexedDB=`[]` (sec 52/67).

## 15. Legacy-key migration risk

Deployed web users may hold `localStorage["rvb.refreshToken"]` from the old
build. Fix never reads it for auth (web `getRefreshToken()` returns null
before any store access) and deletes it at every web entry point (bootstrap
start, post-login success, logout finally, terminal-401 cleanup). Sentinel
proof sec 50.

## 16. CORS/cookie feasibility

Backend `server.ts`: `credentials: true`, origin allow-list (`CORS_ORIGIN`
or default). Cookie `SameSite=Lax`: same-host cross-port (dev
`127.0.0.1:8086→:5036`) is same-site (port ignored) → cookie sent/stored
with `credentials:include` — proven at runtime (F2 cookie present, F3/F4
cookie restores). Production requires shared-host or `CORS_ORIGIN` config
(ops concern, documented; no code change needed). No backend change required
→ CASE 2 without CASE 4.

## 17. Mobile source-control/gitlink limitation

Superproject index holds `R.V.B-mobile` as a gitlink with no `.gitmodules`
mapping and no nested `.git` (proven PBS-BUG-034): superproject `git diff/
show/log` cannot see mobile worktree edits. BEFORE = cycle-start worktree
snapshot copies under `TEMP-PBS-BUG-036-BEFORE/` (hash-verified); AFTER =
worktree bytes; DIFFs = `git diff --no-index` snapshot→worktree. If nested
Git ever appears, this method still holds (hashes rule).

## 18. Captured pre-fix file hashes/snapshots

Snapshot dir `TEMP-PBS-BUG-036-BEFORE/` (deleted after embedding+verification
per rule; hashes recorded here):
- `auth-store.ts` ← `src/stores/auth-store.ts` SHA256
  `9EAF7A7F1BA50C26F87A7DF8A769EEA825A5BA78653BBCD5ACEBE041FFEF6CDD` SNAP-OK
- `client.ts` ← `src/api/client.ts` SHA256
  `19653195BA0450CCB314382E252139E689A462E12A5BA32CA5C6617B949B8F26` SNAP-OK
- `secure-store.ts` ← `src/services/secure-store.ts` SHA256
  `2BA24BFE3CA56CF0210CAD3D908AAF6347F8C1CB6E92F036F8B3EEC3BDB0134C` SNAP-OK
- `socket.ts`, `config.ts` snapshotted as considered-but-unmodified witnesses
  (no production change; no audit blocks required).
Final AFTER hashes: auth-store
`BB2A5F5B923AB7D9D640BB9F60C03CFB81B8CBC66E4F3DCB98587F6EE259502C`,
client.ts
`0F0941DA30BFB555B258E991C4E061103324865BEF9774E18378C03D4DB575E9`,
secure-store.ts
`9CBC2EA6428496C1831ACB6F9E33539B8A5094F562A4111F813FFA4E88953403`.

## 19. Runtime environment

(a) Service harness: real backend routers/models (auth+directory) on
MongoMemoryReplSet; REAL mobile `api/client` + `auth-store` + `secure-store`
via `@/` tsconfig paths; `react-native` Platform stub (env-switchable
web/android); `expo-secure-store` FAITHFUL boundary stub (web: throws like
the real `{}` module; android: async-KV contract); observable localStorage
shim; (post-fix) web-only cookie jar mirroring browser semantics. (b) Real
Chromium (Playwright 1.63, bundled chromium-1243) driving the REAL
`expo export --platform web` bundle (API URL baked) served statically with
SPA fallback against the real backend. No raw tokens in any log (length +
hash-prefix fingerprints only).

## 20. Fresh-web-storage control

`[chrome] B1-fresh {"ls":[],"ss":[],"cookie":"","idb":"present-api"}` — clean
slate proven before login.

## 21. Pre-fix real Expo-Web login

`[chrome] B2-loginRes={status:200,hasRefreshToken=true} loginGone=true`
(manager UI rendered).
`[chrome] B2-stored {lsKeys:["rvb.refreshToken"],has:true,len:328,djb:<match>}`
`match=true lens=328/328` — stored fingerprint EQUALS response fingerprint.
Service harness identical: `match=true`. DECISIVE bug signature reproduced
twice.

## 22. JS-readability proof

`[chrome] B2-stored … "readable":true` — same-page
`window.localStorage.getItem("rvb.refreshToken")` returns the credential.
Defensive read-only check; no exploit involved.

## 23. Pre-fix hard-reload restore

`[chrome] B4-reload loginVisible=false stored={has:true,len:328}
rotated=true` (+ `POST /refresh -> 200`): reload → bootstrap reads
localStorage → refresh rotates (value changed) → authenticated. localStorage
is the live session source, not residue. Service harness: `reload
status=authenticated … storedFp` rotated likewise.

## 24. Pre-fix 401 refresh

Service harness: corrupt access → `retry {ok:true,tag}` with rotation
persisted back to localStorage (fingerprint changed). Chromium net trail
shows refresh→directory recovery flows. Rotation-writeback proven.

## 25. Pre-fix logout

Service harness: `logout status=anonymous lsHas=false` + secure delete ops.
Browser UI logout blocked by expo-Alert confirm (see sec 81); server
revocation + cookie clearing proven at module/supertest level (sec 58).

## 26. Native SecureStore control

Android-mode service run (faithful stub boundary): login `secureCalls=[set]`,
`lsKeys=(empty)`; reload authenticated via SecureStore; retry 200 with
SecureStore rotation; logout get+delete ops; localStorage NEVER touched.
Real-emulator run unavailable (documented limitation); wrapper logic is
platform-branched and the stub reproduces the SecureStore async-KV contract
exactly.

## 27. Legacy sentinel fixture

`localStorage["rvb.refreshToken"]="PBS036_LEGACY_SENTINEL_NOT_A_TOKEN"`
(fake, non-secret). Pre-fix bootstrap consumed-and-deleted it via a doomed
refresh (proving old code READ the key for auth). Post-fix F1 (sec 50).

## 28. Decision-gate result

CASE 2 — bug reproduced (sec 21-23) AND Expo Web is a supported authenticated
runtime (sec 12). Fix: web → backend HttpOnly-cookie architecture; native →
unchanged SecureStore. No backend change needed (sec 16). Not CASE 1/3/4.

## 29. Exact root cause

Two coupled defects: (1) wrapper fallback persisted the JSON refresh token to
JS-readable localStorage on web (SecureStore always throws there); (2) the
mobile stack claimed native identity on web, so the backend minted native
sessions returning the token in JSON — manufacturing the very credential that
(1) then exposed.

## 30. Selected secure architecture

Dual-platform, backend-contract-native: NATIVE = `X-RVB-Client`,
body/header token, SecureStore, memory access (byte-unchanged). WEB = no
native identity, `credentials:include` on session endpoints, HttpOnly cookie
carries the session, access memory-only, bootstrap/refresh/logout/change-
password all cookie-driven, legacy key purged and never read. Single shared
response-handling code paths; branches confined to credential sourcing.

## 31. Why alternative insecure stores were rejected

sessionStorage/IndexedDB/readable cookies (rules 9-10, false-fix 1,2,6):
equally JS-readable. Client-side encryption (rules 11-12, false-fix 3,4):
key would live beside the ciphertext in JS. Key renaming (false-fix 5):
same exposure. Read-but-don't-write (false-fix 7): leaves the credential.
Breaking web auth (false-fix 8): web is supported (sec 12). Native storage
change (false-fix 9) / Zustand persistence (false-fix 10): gratuitous risk.

## 32. Web secure-store behavior

`isWebPlatform()` (new export, `Platform.OS==="web"`, throw-safe) checked
FIRST: get→`null`, set→no-op return, delete→`removeItem` legacy key only.
SecureStore never invoked on web; native `try/catch` semantics preserved
with dead localStorage fallbacks REMOVED (grep-clean, sec 66).

## 33. Legacy credential cleanup

`deleteRefreshToken()` web branch removes the key; invoked at web bootstrap
start, post-login success, logout finally, and terminal-401 cleanup. Never
authenticated from (get returns null first). Sentinel proof sec 50.

## 34. Platform-aware login design

Web: no `X-RVB-Client`, no `native:true` body, `credentials:include` →
backend mints `web` session, sets cookie, returns access+account only;
`if (refreshToken)` skip hits; explicit legacy purge; memory access + state.
Native: byte-identical to before. Inert read headers (onboarding/
refreshProfile) deliberately untouched: they never mint credentials (backend
ignores the header outside login), minimizing diff/risk — documented, not
overlooked.

## 35. Platform-aware bootstrap design

Web: purge → cookie-refresh POST (`{}`, include) → shared outcome handling
(401→anonymous+purge; 5xx/network→anonymous+retryable error, nothing stored
to destroy; success→memory+authenticated). Native: unchanged gate + body
protocol. Bounded single request, no loop.

## 36. Platform-aware refresh design

`performRefresh()`: `web ? null : getRefreshToken()`; request branched
(headers/body/credentials); response handling 100% shared (401/5xx/terminal/
success/store-sync). Web 401 → legacy purge + memory clear; web success →
memory + store (no JSON token exists to persist). Single shared
`pendingRefreshPromise` mutex → F5 dedupe proven both modes (`refresh=1`
for 3 concurrent).

## 37. Platform-aware logout design

Web: cookie sent (`credentials:include`) → server revokes by cookie hash +
`clearCookie`; memory/store cleared; socket disconnected; legacy key absent.
Native: explicit token/header/body path unchanged. Server revocation proven
(`SESSION_REVOKED` after), cookie-clearing header proven (`cleared=true`).

## 38. Change-password/session-rotation design

Web: `credentials:include` added so the rotated cookie is stored; response
carries no JSON token for web sessions → conditional persist skipped;
memory access updated. Native: rotation token persisted to SecureStore
(`ssRotated=true`). Both modes: post-rotation restore works (web via jar/
browser cookie, android via SecureStore).

## 39. Socket boundary

Mobile `socket.ts` uses memory access token only (`auth:{token}`); no
refresh credential flows through it; untouched. Post-login/post-restore
server-side socket presence observed in Chromium (`F21-srvSockets=1`).

## 40. Permanent files changed

- `R.V.B-mobile/src/services/secure-store.ts` (58→64 lines)
- `R.V.B-mobile/src/api/client.ts` (223→229 lines)
- `R.V.B-mobile/src/stores/auth-store.ts` (357→379 lines)
Nothing else. No backend/web/mobile-other changes.

## 41. File 1 — path + baseline

Path: `R.V.B-mobile/src/services/secure-store.ts`
Baseline SHA-256: `2BA24BFE3CA56CF0210CAD3D908AAF6347F8C1CB6E92F036F8B3EEC3BDB0134C`
(snapshot `TEMP-PBS-BUG-036-BEFORE/secure-store.ts`, SNAP-OK).
COMPLETE FULL BEFORE:

<!-- BLOCK:BEFORE-SECURE -->
```ts
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const REFRESH_TOKEN_KEY = "rvb.refreshToken";

export const SECURE_STORE_KEY = REFRESH_TOKEN_KEY;

export async function getRefreshToken(): Promise<string | null> {
  try {
    const v = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    return v;
  } catch (e) {
    // Fallback for web where SecureStore may be unavailable in some environments
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        return window.localStorage.getItem(REFRESH_TOKEN_KEY);
      } catch {
        return null;
      }
    }
    console.warn("[secure-store] getRefreshToken failed", e);
    return null;
  }
}

export async function setRefreshToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  } catch (e) {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(REFRESH_TOKEN_KEY, token);
        return;
      } catch {}
    }
    console.warn("[secure-store] setRefreshToken failed", e);
    throw e;
  }
}

export async function deleteRefreshToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch (_e) {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(REFRESH_TOKEN_KEY);
        return;
      } catch {}
    }
  }
}

// Test helper - not for production use
export async function hasRefreshToken(): Promise<boolean> {
  const t = await getRefreshToken();
  return !!t;
}
```

## 42. File 1 — COMPLETE FULL AFTER

Final SHA-256: `9CBC2EA6428496C1831ACB6F9E33539B8A5094F562A4111F813FFA4E88953403`

<!-- BLOCK:AFTER-SECURE -->
```ts
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const REFRESH_TOKEN_KEY = "rvb.refreshToken";

export const SECURE_STORE_KEY = REFRESH_TOKEN_KEY;

// PBS-BUG-036: platform distinction for refresh-credential storage.
// Native (iOS/Android) persists the JSON refresh token in SecureStore.
// Expo Web must NEVER hold a long-lived refresh credential in JS-readable
// storage: web uses the backend HttpOnly-cookie session instead, so these
// helpers branch BEFORE any SecureStore call on web.
export function isWebPlatform(): boolean {
  try {
    return Platform.OS === "web";
  } catch {
    return false;
  }
}

export async function getRefreshToken(): Promise<string | null> {
  // Web: no JS-readable refresh credential exists by design; callers use the
  // HttpOnly cookie flow. Never consult SecureStore/localStorage shims here.
  if (isWebPlatform()) return null;
  try {
    const v = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    return v;
  } catch (e) {
    console.warn("[secure-store] getRefreshToken failed", e);
    return null;
  }
}

export async function setRefreshToken(token: string): Promise<void> {
  // Web: no-op by design — a JSON refresh token must never be persisted into
  // localStorage/sessionStorage/cookies. Cookie sessions carry web auth.
  if (isWebPlatform()) return;
  try {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  } catch (e) {
    console.warn("[secure-store] setRefreshToken failed", e);
    throw e;
  }
}

export async function deleteRefreshToken(): Promise<void> {
  // Web: remove the legacy insecure key if a previous version stored it.
  // Never read it back for authentication (see getRefreshToken above).
  if (isWebPlatform()) {
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch {}
    return;
  }
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch {}
}

// Test helper - not for production use
export async function hasRefreshToken(): Promise<boolean> {
  const t = await getRefreshToken();
  return !!t;
}
```

## 43. File 1 — DIFF + MATCH

<!-- BLOCK:DIFF-SECURE -->
```diff
diff --git a/TEMP-PBS-BUG-036-BEFORE/secure-store.ts b/R.V.B-mobile/src/services/secure-store.ts
index 1be274f..167689f 100644
--- a/TEMP-PBS-BUG-036-BEFORE/secure-store.ts
+++ b/R.V.B-mobile/src/services/secure-store.ts
@@ -5,50 +5,56 @@ const REFRESH_TOKEN_KEY = "rvb.refreshToken";
 
 export const SECURE_STORE_KEY = REFRESH_TOKEN_KEY;
 
+// PBS-BUG-036: platform distinction for refresh-credential storage.
+// Native (iOS/Android) persists the JSON refresh token in SecureStore.
+// Expo Web must NEVER hold a long-lived refresh credential in JS-readable
+// storage: web uses the backend HttpOnly-cookie session instead, so these
+// helpers branch BEFORE any SecureStore call on web.
+export function isWebPlatform(): boolean {
+  try {
+    return Platform.OS === "web";
+  } catch {
+    return false;
+  }
+}
+
 export async function getRefreshToken(): Promise<string | null> {
+  // Web: no JS-readable refresh credential exists by design; callers use the
+  // HttpOnly cookie flow. Never consult SecureStore/localStorage shims here.
+  if (isWebPlatform()) return null;
   try {
     const v = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
     return v;
   } catch (e) {
-    // Fallback for web where SecureStore may be unavailable in some environments
-    if (Platform.OS === "web" && typeof window !== "undefined") {
-      try {
-        return window.localStorage.getItem(REFRESH_TOKEN_KEY);
-      } catch {
-        return null;
-      }
-    }
     console.warn("[secure-store] getRefreshToken failed", e);
     return null;
   }
 }
 
 export async function setRefreshToken(token: string): Promise<void> {
+  // Web: no-op by design — a JSON refresh token must never be persisted into
+  // localStorage/sessionStorage/cookies. Cookie sessions carry web auth.
+  if (isWebPlatform()) return;
   try {
     await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
   } catch (e) {
-    if (Platform.OS === "web" && typeof window !== "undefined") {
-      try {
-        window.localStorage.setItem(REFRESH_TOKEN_KEY, token);
-        return;
-      } catch {}
-    }
     console.warn("[secure-store] setRefreshToken failed", e);
     throw e;
   }
 }
 
 export async function deleteRefreshToken(): Promise<void> {
+  // Web: remove the legacy insecure key if a previous version stored it.
+  // Never read it back for authentication (see getRefreshToken above).
+  if (isWebPlatform()) {
+    try {
+      if (typeof window !== "undefined") window.localStorage.removeItem(REFRESH_TOKEN_KEY);
+    } catch {}
+    return;
+  }
   try {
     await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
-  } catch (_e) {
-    if (Platform.OS === "web" && typeof window !== "undefined") {
-      try {
-        window.localStorage.removeItem(REFRESH_TOKEN_KEY);
-        return;
-      } catch {}
-    }
-  }
+  } catch {}
 }
 
 // Test helper - not for production use
```

MATCH proof: sec 79 verification (`BEFORE-SECURE`==snapshot hash above,
`AFTER-SECURE`==final hash above, `DIFF-SECURE`==`git diff --no-index`
snapshot→worktree).

## 44. File 2 — path + baseline + COMPLETE FULL BEFORE

Path: `R.V.B-mobile/src/api/client.ts`
Baseline SHA-256: `19653195BA0450CCB314382E252139E689A462E12A5BA32CA5C6617B949B8F26`
(snapshot `TEMP-PBS-BUG-036-BEFORE/client.ts`, SNAP-OK).

<!-- BLOCK:BEFORE-CLIENT -->
```ts
import { getApiBaseUrl } from "@/api/config";
import { RvbApiError } from "@/types/rvb";
import { getRefreshToken, setRefreshToken, deleteRefreshToken } from "@/services/secure-store";

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
  skipRefresh?: boolean;
  timeoutMs?: number;
}

let pendingRefreshPromise: Promise<boolean> | null = null;
let accessTokenMemory: string | null = null;

// Allow auth store to inject memory token getters/setters without circular import at init
export function setAccessTokenMemory(token: string | null) {
  accessTokenMemory = token;
}

export function getAccessTokenMemory(): string | null {
  return accessTokenMemory;
}

function isTerminalAuthCode(code: string): boolean {
  return ["RVB_SESSION_REVOKED", "RVB_ACCOUNT_DISABLED", "RVB_ACCOUNT_ARCHIVED", "RVB_TOKEN_INVALID", "RVB_TOKEN_EXPIRED"].includes(code);
}

async function performRefresh(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return false;
  try {
    const base = getApiBaseUrl();
    const res = await fetch(`${base}/api/rvb/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RVB-Client": "native",
      },
      body: JSON.stringify({ refreshToken }),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok || !json || !json.accessToken) {
      // Invalid/expired -> clear
      const code = json?.code as string | undefined;
      // Network error vs invalid? Will be handled by caller distinguishing.
      // For now, if we got JSON with error code, treat as terminal invalid.
      if (res.status === 401) {
        await deleteRefreshToken();
        setAccessTokenMemory(null);
        return false;
      }
      // Other errors: don't delete token on transient server error
      if (res.status >= 500) {
        return false;
      }
      // Default: delete on 401 invalid
      if (code && isTerminalAuthCode(code)) {
        await deleteRefreshToken();
        setAccessTokenMemory(null);
      }
      return false;
    }
    // Success
    setAccessTokenMemory(json.accessToken);
    if (json.refreshToken) {
      await setRefreshToken(json.refreshToken);
    }
    // Optionally update stored account? Auth store will handle via bootstrap/refresh caller.
    // We need to notify auth store: but we can update a global listener
    // For now, store will be updated via imported setter if needed.
    // Notify via custom event? Instead, try to update Zustand if available.
    try {
      const { useAuthStore } = await import("@/stores/auth-store");
      const state = useAuthStore.getState();
      if (json.account) {
        useAuthStore.setState({ account: json.account, accessToken: json.accessToken, status: "authenticated", error: null });
      } else {
        useAuthStore.setState({ accessToken: json.accessToken });
      }
    } catch {}
    return true;
  } catch (e: any) {
    // Network failure: do NOT delete token
    console.warn("[api] refresh network failure", e?.message || e);
    return false;
  }
}

function getPendingRefresh(): Promise<boolean> {
  if (pendingRefreshPromise) return pendingRefreshPromise;
  pendingRefreshPromise = performRefresh().finally(() => {
    pendingRefreshPromise = null;
  });
  return pendingRefreshPromise;
}

export async function rvbRequest<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const base = getApiBaseUrl();
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const method = options.method || "GET";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-RVB-Client": "native",
    ...options.headers,
  };

  if (!options.skipAuth && accessTokenMemory) {
    headers["Authorization"] = `Bearer ${accessTokenMemory}`;
  }

  let bodyStr: string | undefined;
  if (options.body !== undefined) {
    bodyStr = JSON.stringify(options.body);
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 15000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: bodyStr,
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timeout);
    if (e?.name === "AbortError") {
      throw new RvbApiError({ status: 0, code: "TIMEOUT", message: "Request timed out" });
    }
    throw new RvbApiError({ status: 0, code: "NETWORK_ERROR", message: "Network error. Check connection and EXPO_PUBLIC_RVB_API_URL", raw: e });
  }
  clearTimeout(timeout);

  // Try parse
  const text = await res.text();
  let json: any = null;
  let isJson = false;
  if (text) {
    try {
      json = JSON.parse(text);
      isJson = true;
    } catch {
      isJson = false;
    }
  }

  if (!res.ok) {
    // Handle 401 with refresh dedupe (once)
    if (res.status === 401 && !options.skipRefresh && !options.skipAuth) {
      const code = (isJson && json?.code) || "";
      // Terminal codes that should not loop refresh? But we still attempt refresh once.
      // If refresh succeeds, retry once.
      // Prevent loops: if this was already a retry with skipRefresh, don't.
      const refreshed = await getPendingRefresh();
      if (refreshed && getAccessTokenMemory()) {
        // retry once with new token, skipRefresh to avoid loop
        return rvbRequest<T>(path, { ...options, skipRefresh: true });
      }
      // Refresh failed -> throw terminal error
      // For revoked session, ensure local clear
      if (code === "RVB_SESSION_REVOKED" || code === "RVB_TOKEN_INVALID" || code === "RVB_TOKEN_EXPIRED" || code === "RVB_REFRESH_REQUIRED") {
        // Clear local session to force re-login
        await deleteRefreshToken();
        setAccessTokenMemory(null);
        try {
          const { useAuthStore } = await import("@/stores/auth-store");
          useAuthStore.getState().clearSession();
        } catch {}
      }
      // Normalize error
      const message = (isJson && (json?.message || json?.error)) || `Unauthorized (${code || res.status})`;
      throw new RvbApiError({ status: res.status, code: code || "RVB_UNAUTHENTICATED", message, data: json, raw: text });
    }

    const code = (isJson && json?.code) || `HTTP_${res.status}`;
    const message = (isJson && (json?.message || json?.error || json?.msg)) || text || `Request failed (${res.status})`;
    // Also handle global revocation codes even not 401? Some backends return 403 for disabled
    if (isTerminalAuthCode(code)) {
      await deleteRefreshToken();
      setAccessTokenMemory(null);
      try {
        const { useAuthStore } = await import("@/stores/auth-store");
        useAuthStore.getState().clearSession();
      } catch {}
    }
    throw new RvbApiError({ status: res.status, code, message, data: json, raw: text });
  }

  if (!isJson) {
    // Non-JSON success? Return text
    return text as unknown as T;
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) => rvbRequest<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) => rvbRequest<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) => rvbRequest<T>(path, { ...opts, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) => rvbRequest<T>(path, { ...opts, method: "PUT", body }),
  del: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) => rvbRequest<T>(path, { ...opts, method: "DELETE" }),
};

// For testing: allow injecting mock refresh behavior
export const _internal = {
  getPendingRefresh,
  performRefresh,
  setAccessTokenMemory,
};
```

## 45. File 2 — COMPLETE FULL AFTER

Final SHA-256: `0F0941DA30BFB555B258E991C4E061103324865BEF9774E18378C03D4DB575E9`
(only `performRefresh` + import changed; rest identical — verified by diff):

<!-- BLOCK:AFTER-CLIENT -->
```ts
import { getApiBaseUrl } from "@/api/config";
import { RvbApiError } from "@/types/rvb";
import { getRefreshToken, setRefreshToken, deleteRefreshToken, isWebPlatform } from "@/services/secure-store";

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
  skipRefresh?: boolean;
  timeoutMs?: number;
}

let pendingRefreshPromise: Promise<boolean> | null = null;
let accessTokenMemory: string | null = null;

// Allow auth store to inject memory token getters/setters without circular import at init
export function setAccessTokenMemory(token: string | null) {
  accessTokenMemory = token;
}

export function getAccessTokenMemory(): string | null {
  return accessTokenMemory;
}

function isTerminalAuthCode(code: string): boolean {
  return ["RVB_SESSION_REVOKED", "RVB_ACCOUNT_DISABLED", "RVB_ACCOUNT_ARCHIVED", "RVB_TOKEN_INVALID", "RVB_TOKEN_EXPIRED"].includes(code);
}

async function performRefresh(): Promise<boolean> {
  // PBS-BUG-036: Expo Web refreshes through the HttpOnly-cookie session
  // (credentials:include, no JSON token, no native identity). Native keeps
  // the SecureStore refresh-token protocol. Response handling below is
  // shared: web responses simply carry no JSON refreshToken, so the
  // conditional persistence is skipped there by construction.
  const web = isWebPlatform();
  const refreshToken = web ? null : await getRefreshToken();
  if (!refreshToken && !web) return false;
  try {
    const base = getApiBaseUrl();
    const res = await fetch(`${base}/api/rvb/auth/refresh`, {
      method: "POST",
      headers: web
        ? { "Content-Type": "application/json" }
        : { "Content-Type": "application/json", "X-RVB-Client": "native" },
      body: web ? JSON.stringify({}) : JSON.stringify({ refreshToken }),
      ...(web ? { credentials: "include" as RequestCredentials } : {}),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok || !json || !json.accessToken) {
      // Invalid/expired -> clear
      const code = json?.code as string | undefined;
      // Network error vs invalid? Will be handled by caller distinguishing.
      // For now, if we got JSON with error code, treat as terminal invalid.
      if (res.status === 401) {
        await deleteRefreshToken();
        setAccessTokenMemory(null);
        return false;
      }
      // Other errors: don't delete token on transient server error
      if (res.status >= 500) {
        return false;
      }
      // Default: delete on 401 invalid
      if (code && isTerminalAuthCode(code)) {
        await deleteRefreshToken();
        setAccessTokenMemory(null);
      }
      return false;
    }
    // Success
    setAccessTokenMemory(json.accessToken);
    if (json.refreshToken) {
      await setRefreshToken(json.refreshToken);
    }
    // Optionally update stored account? Auth store will handle via bootstrap/refresh caller.
    // We need to notify auth store: but we can update a global listener
    // For now, store will be updated via imported setter if needed.
    // Notify via custom event? Instead, try to update Zustand if available.
    try {
      const { useAuthStore } = await import("@/stores/auth-store");
      const state = useAuthStore.getState();
      if (json.account) {
        useAuthStore.setState({ account: json.account, accessToken: json.accessToken, status: "authenticated", error: null });
      } else {
        useAuthStore.setState({ accessToken: json.accessToken });
      }
    } catch {}
    return true;
  } catch (e: any) {
    // Network failure: do NOT delete token
    console.warn("[api] refresh network failure", e?.message || e);
    return false;
  }
}

function getPendingRefresh(): Promise<boolean> {
  if (pendingRefreshPromise) return pendingRefreshPromise;
  pendingRefreshPromise = performRefresh().finally(() => {
    pendingRefreshPromise = null;
  });
  return pendingRefreshPromise;
}

export async function rvbRequest<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const base = getApiBaseUrl();
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const method = options.method || "GET";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-RVB-Client": "native",
    ...options.headers,
  };

  if (!options.skipAuth && accessTokenMemory) {
    headers["Authorization"] = `Bearer ${accessTokenMemory}`;
  }

  let bodyStr: string | undefined;
  if (options.body !== undefined) {
    bodyStr = JSON.stringify(options.body);
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 15000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: bodyStr,
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timeout);
    if (e?.name === "AbortError") {
      throw new RvbApiError({ status: 0, code: "TIMEOUT", message: "Request timed out" });
    }
    throw new RvbApiError({ status: 0, code: "NETWORK_ERROR", message: "Network error. Check connection and EXPO_PUBLIC_RVB_API_URL", raw: e });
  }
  clearTimeout(timeout);

  // Try parse
  const text = await res.text();
  let json: any = null;
  let isJson = false;
  if (text) {
    try {
      json = JSON.parse(text);
      isJson = true;
    } catch {
      isJson = false;
    }
  }

  if (!res.ok) {
    // Handle 401 with refresh dedupe (once)
    if (res.status === 401 && !options.skipRefresh && !options.skipAuth) {
      const code = (isJson && json?.code) || "";
      // Terminal codes that should not loop refresh? But we still attempt refresh once.
      // If refresh succeeds, retry once.
      // Prevent loops: if this was already a retry with skipRefresh, don't.
      const refreshed = await getPendingRefresh();
      if (refreshed && getAccessTokenMemory()) {
        // retry once with new token, skipRefresh to avoid loop
        return rvbRequest<T>(path, { ...options, skipRefresh: true });
      }
      // Refresh failed -> throw terminal error
      // For revoked session, ensure local clear
      if (code === "RVB_SESSION_REVOKED" || code === "RVB_TOKEN_INVALID" || code === "RVB_TOKEN_EXPIRED" || code === "RVB_REFRESH_REQUIRED") {
        // Clear local session to force re-login
        await deleteRefreshToken();
        setAccessTokenMemory(null);
        try {
          const { useAuthStore } = await import("@/stores/auth-store");
          useAuthStore.getState().clearSession();
        } catch {}
      }
      // Normalize error
      const message = (isJson && (json?.message || json?.error)) || `Unauthorized (${code || res.status})`;
      throw new RvbApiError({ status: res.status, code: code || "RVB_UNAUTHENTICATED", message, data: json, raw: text });
    }

    const code = (isJson && json?.code) || `HTTP_${res.status}`;
    const message = (isJson && (json?.message || json?.error || json?.msg)) || text || `Request failed (${res.status})`;
    // Also handle global revocation codes even not 401? Some backends return 403 for disabled
    if (isTerminalAuthCode(code)) {
      await deleteRefreshToken();
      setAccessTokenMemory(null);
      try {
        const { useAuthStore } = await import("@/stores/auth-store");
        useAuthStore.getState().clearSession();
      } catch {}
    }
    throw new RvbApiError({ status: res.status, code, message, data: json, raw: text });
  }

  if (!isJson) {
    // Non-JSON success? Return text
    return text as unknown as T;
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) => rvbRequest<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) => rvbRequest<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) => rvbRequest<T>(path, { ...opts, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) => rvbRequest<T>(path, { ...opts, method: "PUT", body }),
  del: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) => rvbRequest<T>(path, { ...opts, method: "DELETE" }),
};

// For testing: allow injecting mock refresh behavior
export const _internal = {
  getPendingRefresh,
  performRefresh,
  setAccessTokenMemory,
};
```

## 46. File 2 — DIFF + MATCH

<!-- BLOCK:DIFF-CLIENT -->
```diff
diff --git a/TEMP-PBS-BUG-036-BEFORE/client.ts b/R.V.B-mobile/src/api/client.ts
index d95afcc..51488a9 100644
--- a/TEMP-PBS-BUG-036-BEFORE/client.ts
+++ b/R.V.B-mobile/src/api/client.ts
@@ -1,6 +1,6 @@
 import { getApiBaseUrl } from "@/api/config";
 import { RvbApiError } from "@/types/rvb";
-import { getRefreshToken, setRefreshToken, deleteRefreshToken } from "@/services/secure-store";
+import { getRefreshToken, setRefreshToken, deleteRefreshToken, isWebPlatform } from "@/services/secure-store";
 
 type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
 
@@ -30,17 +30,23 @@ function isTerminalAuthCode(code: string): boolean {
 }
 
 async function performRefresh(): Promise<boolean> {
-  const refreshToken = await getRefreshToken();
-  if (!refreshToken) return false;
+  // PBS-BUG-036: Expo Web refreshes through the HttpOnly-cookie session
+  // (credentials:include, no JSON token, no native identity). Native keeps
+  // the SecureStore refresh-token protocol. Response handling below is
+  // shared: web responses simply carry no JSON refreshToken, so the
+  // conditional persistence is skipped there by construction.
+  const web = isWebPlatform();
+  const refreshToken = web ? null : await getRefreshToken();
+  if (!refreshToken && !web) return false;
   try {
     const base = getApiBaseUrl();
     const res = await fetch(`${base}/api/rvb/auth/refresh`, {
       method: "POST",
-      headers: {
-        "Content-Type": "application/json",
-        "X-RVB-Client": "native",
-      },
-      body: JSON.stringify({ refreshToken }),
+      headers: web
+        ? { "Content-Type": "application/json" }
+        : { "Content-Type": "application/json", "X-RVB-Client": "native" },
+      body: web ? JSON.stringify({}) : JSON.stringify({ refreshToken }),
+      ...(web ? { credentials: "include" as RequestCredentials } : {}),
     });
     const text = await res.text();
     let json: any = null;
```

MATCH proof: sec 79 verification.

## 47. File 3 — path + baseline + COMPLETE FULL BEFORE

Path: `R.V.B-mobile/src/stores/auth-store.ts`
Baseline SHA-256: `9EAF7A7F1BA50C26F87A7DF8A769EEA825A5BA78653BBCD5ACEBE041FFEF6CDD`
(snapshot `TEMP-PBS-BUG-036-BEFORE/auth-store.ts`, SNAP-OK).

<!-- BLOCK:BEFORE-STORE -->
```ts
import { create } from "zustand";
import { getApiBaseUrl } from "@/api/config";
import { setAccessTokenMemory, getAccessTokenMemory } from "@/api/client";
import { getRefreshToken, setRefreshToken, deleteRefreshToken } from "@/services/secure-store";
import { normalizeTag } from "@/utils/tag";
import type { RvbAccount, AuthStatus } from "@/types/rvb";
import { RvbApiError } from "@/types/rvb";

interface AuthState {
  status: AuthStatus;
  account: RvbAccount | null;
  accessToken: string | null;
  error: string | null;
  isLoading: boolean;
  isBootstrapped: boolean;

  bootstrap: () => Promise<void>;
  login: (rawTag: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<void>;
  completeOnboarding: (profilePicture: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearSession: () => void;
  setAccount: (account: RvbAccount | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "booting",
  account: null,
  accessToken: null,
  error: null,
  isLoading: false,
  isBootstrapped: false,

  clearSession: () => {
    setAccessTokenMemory(null);
    set({ status: "anonymous", account: null, accessToken: null, error: null, isLoading: false });
  },

  setAccount: (account) => set({ account }),

  bootstrap: async () => {
    set({ status: "booting", error: null, isLoading: true });
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        set({ status: "anonymous", account: null, accessToken: null, isLoading: false, isBootstrapped: true });
        return;
      }
      const base = getApiBaseUrl();
      let res: Response;
      try {
        res = await fetch(`${base}/api/rvb/auth/refresh`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-RVB-Client": "native",
          },
          body: JSON.stringify({ refreshToken }),
        });
      } catch (e: any) {
        // Network failure: do not delete token
        console.warn("[auth] bootstrap network failure", e?.message);
        set({
          status: "anonymous",
          error: "Network unavailable. Please check connection and retry.",
          isLoading: false,
          isBootstrapped: true,
        });
        return;
      }

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok || !json?.accessToken) {
        const code = json?.code as string | undefined;
        // Distinguish invalid vs transient
        if (res.status === 401) {
          // Invalid/expired/revoked -> delete
          await deleteRefreshToken();
          setAccessTokenMemory(null);
          set({
            status: "anonymous",
            account: null,
            accessToken: null,
            error: null,
            isLoading: false,
            isBootstrapped: true,
          });
          return;
        }
        if (res.status >= 500) {
          // Server error: keep token
          set({
            status: "anonymous",
            error: "Server unavailable. Please retry.",
            isLoading: false,
            isBootstrapped: true,
          });
          return;
        }
        // Other: delete if terminal
        if (code && ["RVB_TOKEN_INVALID", "RVB_TOKEN_EXPIRED", "RVB_SESSION_REVOKED", "RVB_REFRESH_REQUIRED"].includes(code)) {
          await deleteRefreshToken();
          setAccessTokenMemory(null);
        }
        set({
          status: "anonymous",
          account: null,
          accessToken: null,
          error: json?.message || "Session expired. Please login again.",
          isLoading: false,
          isBootstrapped: true,
        });
        return;
      }

      // Success
      const { accessToken, refreshToken: newRefresh, account } = json;
      setAccessTokenMemory(accessToken);
      if (newRefresh) await setRefreshToken(newRefresh);
      set({
        status: "authenticated",
        account: account as RvbAccount,
        accessToken,
        error: null,
        isLoading: false,
        isBootstrapped: true,
      });

      // Optionally fetch fresh me to ensure mustChangePassword/onboarding sync
      // But refresh already returned account
    } catch (e: any) {
      console.warn("[auth] bootstrap unexpected", e);
      set({ status: "anonymous", error: e?.message || "Bootstrap failed", isLoading: false, isBootstrapped: true });
    }
  },

  login: async (rawTag, password) => {
    const tag = normalizeTag(rawTag);
    if (!tag) throw new RvbApiError({ status: 400, code: "RVB_TAG_REQUIRED", message: "Tag is required" });
    if (!password) throw new RvbApiError({ status: 400, code: "RVB_PASSWORD_REQUIRED", message: "Password is required" });

    set({ isLoading: true, error: null });
    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/rvb/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RVB-Client": "native",
        },
        body: JSON.stringify({ tag, password, native: true }),
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!res.ok || !json?.accessToken) {
        const code = json?.code || `HTTP_${res.status}`;
        const message = json?.message || json?.error || text || "Login failed";
        // Do not persist tokens on failure
        set({ isLoading: false, error: message });
        throw new RvbApiError({ status: res.status, code, message, data: json, raw: text });
      }
      const { accessToken, refreshToken, account } = json;
      if (refreshToken) await setRefreshToken(refreshToken);
      setAccessTokenMemory(accessToken);
      set({
        status: "authenticated",
        account: account as RvbAccount,
        accessToken,
        error: null,
        isLoading: false,
        isBootstrapped: true,
      });
    } catch (e: any) {
      if (e instanceof RvbApiError) throw e;
      // network
      const msg = e?.message || "Network error";
      set({ isLoading: false, error: msg });
      throw new RvbApiError({ status: 0, code: "NETWORK_ERROR", message: msg, raw: e });
    }
  },

  logout: async () => {
    const token = get().accessToken || getAccessTokenMemory();
    const refresh = await getRefreshToken();
    try {
      const base = getApiBaseUrl();
      // Best effort: send both header and body
      await fetch(`${base}/api/rvb/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RVB-Client": "native",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(refresh ? { "X-Refresh-Token": refresh } : {}),
        },
        body: JSON.stringify(refresh ? { refreshToken: refresh } : {}),
      });
    } catch (e) {
      console.warn("[auth] logout network error, still clearing locally", e);
    } finally {
      await deleteRefreshToken();
      setAccessTokenMemory(null);
      set({ status: "anonymous", account: null, accessToken: null, error: null, isLoading: false });
      // Disconnect socket
      try {
        const { disconnectSocket } = await import("@/services/socket");
        disconnectSocket();
      } catch {}
    }
  },

  changePassword: async (currentPassword, newPassword, confirmPassword) => {
    const token = get().accessToken || getAccessTokenMemory();
    if (!token) throw new RvbApiError({ status: 401, code: "RVB_UNAUTHENTICATED", message: "Not authenticated" });
    set({ isLoading: true, error: null });
    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/rvb/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RVB-Client": "native",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!res.ok) {
        const code = json?.code || `HTTP_${res.status}`;
        const message = json?.message || text || "Change password failed";
        set({ isLoading: false, error: message });
        throw new RvbApiError({ status: res.status, code, message, data: json, raw: text });
      }
      // Success: may return new tokens
      if (json?.accessToken) {
        setAccessTokenMemory(json.accessToken);
        set({ accessToken: json.accessToken });
      }
      if (json?.refreshToken) {
        await setRefreshToken(json.refreshToken);
      }
      if (json?.account) {
        set({ account: json.account as RvbAccount, isLoading: false, error: null });
      } else {
        // fetch fresh profile
        await get().refreshProfile();
        set({ isLoading: false });
      }
    } catch (e: any) {
      if (e instanceof RvbApiError) throw e;
      set({ isLoading: false, error: e?.message || "Network error" });
      throw new RvbApiError({ status: 0, code: "NETWORK_ERROR", message: e?.message || "Network error", raw: e });
    }
  },

  completeOnboarding: async (profilePicture) => {
    const token = get().accessToken || getAccessTokenMemory();
    if (!token) throw new RvbApiError({ status: 401, code: "RVB_UNAUTHENTICATED", message: "Not authenticated" });
    if (!profilePicture || !profilePicture.startsWith("data:image/")) {
      throw new RvbApiError({ status: 400, code: "RVB_PROFILE_PICTURE_REQUIRED", message: "Profile picture required" });
    }
    if (profilePicture.length > 250000) {
      throw new RvbApiError({ status: 400, code: "RVB_PROFILE_PICTURE_TOO_LARGE", message: "Image too large" });
    }
    set({ isLoading: true, error: null });
    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/rvb/auth/onboarding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RVB-Client": "native",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ profilePicture }),
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!res.ok) {
        const code = json?.code || `HTTP_${res.status}`;
        const message = json?.message || text || "Onboarding failed";
        set({ isLoading: false, error: message });
        throw new RvbApiError({ status: res.status, code, message, data: json, raw: text });
      }
      if (json?.account) {
        set({ account: json.account as RvbAccount, isLoading: false, error: null });
      } else {
        await get().refreshProfile();
        set({ isLoading: false });
      }
    } catch (e: any) {
      if (e instanceof RvbApiError) throw e;
      set({ isLoading: false, error: e?.message || "Network error" });
      throw new RvbApiError({ status: 0, code: "NETWORK_ERROR", message: e?.message || "Network error", raw: e });
    }
  },

  refreshProfile: async () => {
    const token = get().accessToken || getAccessTokenMemory();
    if (!token) return;
    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/rvb/auth/me`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-RVB-Client": "native",
          Authorization: `Bearer ${token}`,
        },
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (res.ok && json?.account) {
        set({ account: json.account as RvbAccount });
      } else if (res.status === 401) {
        // session revoked etc.
        const code = json?.code || "";
        if (["RVB_SESSION_REVOKED", "RVB_TOKEN_INVALID", "RVB_ACCOUNT_DISABLED", "RVB_ACCOUNT_ARCHIVED"].includes(code)) {
          await deleteRefreshToken();
          setAccessTokenMemory(null);
          set({ status: "anonymous", account: null, accessToken: null });
        }
      }
    } catch (e) {
      console.warn("[auth] refreshProfile failed", e);
    }
  },
}));
```

## 48. File 3 — COMPLETE FULL AFTER

Final SHA-256: `BB2A5F5B923AB7D9D640BB9F60C03CFB81B8CBC66E4F3DCB98587F6EE259502C`

<!-- BLOCK:AFTER-STORE -->
```ts
import { create } from "zustand";
import { getApiBaseUrl } from "@/api/config";
import { setAccessTokenMemory, getAccessTokenMemory } from "@/api/client";
import { getRefreshToken, setRefreshToken, deleteRefreshToken, isWebPlatform } from "@/services/secure-store";
import { normalizeTag } from "@/utils/tag";
import type { RvbAccount, AuthStatus } from "@/types/rvb";
import { RvbApiError } from "@/types/rvb";

interface AuthState {
  status: AuthStatus;
  account: RvbAccount | null;
  accessToken: string | null;
  error: string | null;
  isLoading: boolean;
  isBootstrapped: boolean;

  bootstrap: () => Promise<void>;
  login: (rawTag: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<void>;
  completeOnboarding: (profilePicture: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearSession: () => void;
  setAccount: (account: RvbAccount | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "booting",
  account: null,
  accessToken: null,
  error: null,
  isLoading: false,
  isBootstrapped: false,

  clearSession: () => {
    setAccessTokenMemory(null);
    set({ status: "anonymous", account: null, accessToken: null, error: null, isLoading: false });
  },

  setAccount: (account) => set({ account }),

  bootstrap: async () => {
    set({ status: "booting", error: null, isLoading: true });
    try {
      // PBS-BUG-036: Expo Web bootstraps from the HttpOnly-cookie session.
      // Purge any legacy insecure key first; it is never read back for auth.
      // Native keeps the SecureStore-token gate below. The response handling
      // after the request is shared: web responses carry no JSON refresh
      // token, so conditional persistence is skipped there by construction.
      const web = isWebPlatform();
      if (web) await deleteRefreshToken();
      const refreshToken = web ? null : await getRefreshToken();
      if (!refreshToken && !web) {
        set({ status: "anonymous", account: null, accessToken: null, isLoading: false, isBootstrapped: true });
        return;
      }
      const base = getApiBaseUrl();
      let res: Response;
      try {
        res = await fetch(`${base}/api/rvb/auth/refresh`, {
          method: "POST",
          headers: web
            ? { "Content-Type": "application/json" }
            : { "Content-Type": "application/json", "X-RVB-Client": "native" },
          body: web ? JSON.stringify({}) : JSON.stringify({ refreshToken }),
          ...(web ? { credentials: "include" as RequestCredentials } : {}),
        });
      } catch (e: any) {
        // Network failure: do not delete token
        console.warn("[auth] bootstrap network failure", e?.message);
        set({
          status: "anonymous",
          error: "Network unavailable. Please check connection and retry.",
          isLoading: false,
          isBootstrapped: true,
        });
        return;
      }

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok || !json?.accessToken) {
        const code = json?.code as string | undefined;
        // Distinguish invalid vs transient
        if (res.status === 401) {
          // Invalid/expired/revoked -> delete
          await deleteRefreshToken();
          setAccessTokenMemory(null);
          set({
            status: "anonymous",
            account: null,
            accessToken: null,
            error: null,
            isLoading: false,
            isBootstrapped: true,
          });
          return;
        }
        if (res.status >= 500) {
          // Server error: keep token
          set({
            status: "anonymous",
            error: "Server unavailable. Please retry.",
            isLoading: false,
            isBootstrapped: true,
          });
          return;
        }
        // Other: delete if terminal
        if (code && ["RVB_TOKEN_INVALID", "RVB_TOKEN_EXPIRED", "RVB_SESSION_REVOKED", "RVB_REFRESH_REQUIRED"].includes(code)) {
          await deleteRefreshToken();
          setAccessTokenMemory(null);
        }
        set({
          status: "anonymous",
          account: null,
          accessToken: null,
          error: json?.message || "Session expired. Please login again.",
          isLoading: false,
          isBootstrapped: true,
        });
        return;
      }

      // Success
      const { accessToken, refreshToken: newRefresh, account } = json;
      setAccessTokenMemory(accessToken);
      if (newRefresh) await setRefreshToken(newRefresh);
      set({
        status: "authenticated",
        account: account as RvbAccount,
        accessToken,
        error: null,
        isLoading: false,
        isBootstrapped: true,
      });

      // Optionally fetch fresh me to ensure mustChangePassword/onboarding sync
      // But refresh already returned account
    } catch (e: any) {
      console.warn("[auth] bootstrap unexpected", e);
      set({ status: "anonymous", error: e?.message || "Bootstrap failed", isLoading: false, isBootstrapped: true });
    }
  },

  login: async (rawTag, password) => {
    const tag = normalizeTag(rawTag);
    if (!tag) throw new RvbApiError({ status: 400, code: "RVB_TAG_REQUIRED", message: "Tag is required" });
    if (!password) throw new RvbApiError({ status: 400, code: "RVB_PASSWORD_REQUIRED", message: "Password is required" });

    set({ isLoading: true, error: null });
    try {
      const base = getApiBaseUrl();
      // PBS-BUG-036: web logs in WITHOUT native identity so the backend mints
      // a cookie (web) session and returns no JSON refresh token. The cookie
      // is stored by the browser (credentials:include); nothing JS-readable
      // is persisted. Native behavior unchanged.
      const web = isWebPlatform();
      const res = await fetch(`${base}/api/rvb/auth/login`, {
        method: "POST",
        headers: web
          ? { "Content-Type": "application/json" }
          : { "Content-Type": "application/json", "X-RVB-Client": "native" },
        body: JSON.stringify(web ? { tag, password } : { tag, password, native: true }),
        ...(web ? { credentials: "include" as RequestCredentials } : {}),
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!res.ok || !json?.accessToken) {
        const code = json?.code || `HTTP_${res.status}`;
        const message = json?.message || json?.error || text || "Login failed";
        // Do not persist tokens on failure
        set({ isLoading: false, error: message });
        throw new RvbApiError({ status: res.status, code, message, data: json, raw: text });
      }
      const { accessToken, refreshToken, account } = json;
      if (refreshToken) await setRefreshToken(refreshToken);
      if (web) await deleteRefreshToken(); // purge legacy insecure key, if any
      setAccessTokenMemory(accessToken);
      set({
        status: "authenticated",
        account: account as RvbAccount,
        accessToken,
        error: null,
        isLoading: false,
        isBootstrapped: true,
      });
    } catch (e: any) {
      if (e instanceof RvbApiError) throw e;
      // network
      const msg = e?.message || "Network error";
      set({ isLoading: false, error: msg });
      throw new RvbApiError({ status: 0, code: "NETWORK_ERROR", message: msg, raw: e });
    }
  },

  logout: async () => {
    const token = get().accessToken || getAccessTokenMemory();
    const refresh = await getRefreshToken();
    // PBS-BUG-036: web sends the HttpOnly cookie (credentials:include) so the
    // server can revoke the cookie session; getRefreshToken() is null on web.
    const web = isWebPlatform();
    try {
      const base = getApiBaseUrl();
      // Best effort: send both header and body
      await fetch(`${base}/api/rvb/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RVB-Client": "native",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(refresh ? { "X-Refresh-Token": refresh } : {}),
        },
        body: JSON.stringify(refresh ? { refreshToken: refresh } : {}),
        ...(web ? { credentials: "include" as RequestCredentials } : {}),
      });
    } catch (e) {
      console.warn("[auth] logout network error, still clearing locally", e);
    } finally {
      await deleteRefreshToken();
      setAccessTokenMemory(null);
      set({ status: "anonymous", account: null, accessToken: null, error: null, isLoading: false });
      // Disconnect socket
      try {
        const { disconnectSocket } = await import("@/services/socket");
        disconnectSocket();
      } catch {}
    }
  },

  changePassword: async (currentPassword, newPassword, confirmPassword) => {
    const token = get().accessToken || getAccessTokenMemory();
    if (!token) throw new RvbApiError({ status: 401, code: "RVB_UNAUTHENTICATED", message: "Not authenticated" });
    set({ isLoading: true, error: null });
    try {
      const base = getApiBaseUrl();
      // PBS-BUG-036: web includes credentials so the rotated HttpOnly cookie
      // is stored by the browser; the response carries no JSON refresh token
      // for web sessions, so the conditional persistence below is skipped.
      const web = isWebPlatform();
      const res = await fetch(`${base}/api/rvb/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RVB-Client": "native",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
        ...(web ? { credentials: "include" as RequestCredentials } : {}),
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!res.ok) {
        const code = json?.code || `HTTP_${res.status}`;
        const message = json?.message || text || "Change password failed";
        set({ isLoading: false, error: message });
        throw new RvbApiError({ status: res.status, code, message, data: json, raw: text });
      }
      // Success: may return new tokens
      if (json?.accessToken) {
        setAccessTokenMemory(json.accessToken);
        set({ accessToken: json.accessToken });
      }
      if (json?.refreshToken) {
        await setRefreshToken(json.refreshToken);
      }
      if (json?.account) {
        set({ account: json.account as RvbAccount, isLoading: false, error: null });
      } else {
        // fetch fresh profile
        await get().refreshProfile();
        set({ isLoading: false });
      }
    } catch (e: any) {
      if (e instanceof RvbApiError) throw e;
      set({ isLoading: false, error: e?.message || "Network error" });
      throw new RvbApiError({ status: 0, code: "NETWORK_ERROR", message: e?.message || "Network error", raw: e });
    }
  },

  completeOnboarding: async (profilePicture) => {
    const token = get().accessToken || getAccessTokenMemory();
    if (!token) throw new RvbApiError({ status: 401, code: "RVB_UNAUTHENTICATED", message: "Not authenticated" });
    if (!profilePicture || !profilePicture.startsWith("data:image/")) {
      throw new RvbApiError({ status: 400, code: "RVB_PROFILE_PICTURE_REQUIRED", message: "Profile picture required" });
    }
    if (profilePicture.length > 250000) {
      throw new RvbApiError({ status: 400, code: "RVB_PROFILE_PICTURE_TOO_LARGE", message: "Image too large" });
    }
    set({ isLoading: true, error: null });
    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/rvb/auth/onboarding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RVB-Client": "native",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ profilePicture }),
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!res.ok) {
        const code = json?.code || `HTTP_${res.status}`;
        const message = json?.message || text || "Onboarding failed";
        set({ isLoading: false, error: message });
        throw new RvbApiError({ status: res.status, code, message, data: json, raw: text });
      }
      if (json?.account) {
        set({ account: json.account as RvbAccount, isLoading: false, error: null });
      } else {
        await get().refreshProfile();
        set({ isLoading: false });
      }
    } catch (e: any) {
      if (e instanceof RvbApiError) throw e;
      set({ isLoading: false, error: e?.message || "Network error" });
      throw new RvbApiError({ status: 0, code: "NETWORK_ERROR", message: e?.message || "Network error", raw: e });
    }
  },

  refreshProfile: async () => {
    const token = get().accessToken || getAccessTokenMemory();
    if (!token) return;
    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/rvb/auth/me`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-RVB-Client": "native",
          Authorization: `Bearer ${token}`,
        },
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (res.ok && json?.account) {
        set({ account: json.account as RvbAccount });
      } else if (res.status === 401) {
        // session revoked etc.
        const code = json?.code || "";
        if (["RVB_SESSION_REVOKED", "RVB_TOKEN_INVALID", "RVB_ACCOUNT_DISABLED", "RVB_ACCOUNT_ARCHIVED"].includes(code)) {
          await deleteRefreshToken();
          setAccessTokenMemory(null);
          set({ status: "anonymous", account: null, accessToken: null });
        }
      }
    } catch (e) {
      console.warn("[auth] refreshProfile failed", e);
    }
  },
}));
```

## 49. File 3 — DIFF + MATCH

<!-- BLOCK:DIFF-STORE -->
```diff
diff --git a/TEMP-PBS-BUG-036-BEFORE/auth-store.ts b/R.V.B-mobile/src/stores/auth-store.ts
index 36c124b..604683a 100644
--- a/TEMP-PBS-BUG-036-BEFORE/auth-store.ts
+++ b/R.V.B-mobile/src/stores/auth-store.ts
@@ -1,7 +1,7 @@
 import { create } from "zustand";
 import { getApiBaseUrl } from "@/api/config";
 import { setAccessTokenMemory, getAccessTokenMemory } from "@/api/client";
-import { getRefreshToken, setRefreshToken, deleteRefreshToken } from "@/services/secure-store";
+import { getRefreshToken, setRefreshToken, deleteRefreshToken, isWebPlatform } from "@/services/secure-store";
 import { normalizeTag } from "@/utils/tag";
 import type { RvbAccount, AuthStatus } from "@/types/rvb";
 import { RvbApiError } from "@/types/rvb";
@@ -42,8 +42,15 @@ export const useAuthStore = create<AuthState>((set, get) => ({
   bootstrap: async () => {
     set({ status: "booting", error: null, isLoading: true });
     try {
-      const refreshToken = await getRefreshToken();
-      if (!refreshToken) {
+      // PBS-BUG-036: Expo Web bootstraps from the HttpOnly-cookie session.
+      // Purge any legacy insecure key first; it is never read back for auth.
+      // Native keeps the SecureStore-token gate below. The response handling
+      // after the request is shared: web responses carry no JSON refresh
+      // token, so conditional persistence is skipped there by construction.
+      const web = isWebPlatform();
+      if (web) await deleteRefreshToken();
+      const refreshToken = web ? null : await getRefreshToken();
+      if (!refreshToken && !web) {
         set({ status: "anonymous", account: null, accessToken: null, isLoading: false, isBootstrapped: true });
         return;
       }
@@ -52,11 +59,11 @@ export const useAuthStore = create<AuthState>((set, get) => ({
       try {
         res = await fetch(`${base}/api/rvb/auth/refresh`, {
           method: "POST",
-          headers: {
-            "Content-Type": "application/json",
-            "X-RVB-Client": "native",
-          },
-          body: JSON.stringify({ refreshToken }),
+          headers: web
+            ? { "Content-Type": "application/json" }
+            : { "Content-Type": "application/json", "X-RVB-Client": "native" },
+          body: web ? JSON.stringify({}) : JSON.stringify({ refreshToken }),
+          ...(web ? { credentials: "include" as RequestCredentials } : {}),
         });
       } catch (e: any) {
         // Network failure: do not delete token
@@ -150,13 +157,18 @@ export const useAuthStore = create<AuthState>((set, get) => ({
     set({ isLoading: true, error: null });
     try {
       const base = getApiBaseUrl();
+      // PBS-BUG-036: web logs in WITHOUT native identity so the backend mints
+      // a cookie (web) session and returns no JSON refresh token. The cookie
+      // is stored by the browser (credentials:include); nothing JS-readable
+      // is persisted. Native behavior unchanged.
+      const web = isWebPlatform();
       const res = await fetch(`${base}/api/rvb/auth/login`, {
         method: "POST",
-        headers: {
-          "Content-Type": "application/json",
-          "X-RVB-Client": "native",
-        },
-        body: JSON.stringify({ tag, password, native: true }),
+        headers: web
+          ? { "Content-Type": "application/json" }
+          : { "Content-Type": "application/json", "X-RVB-Client": "native" },
+        body: JSON.stringify(web ? { tag, password } : { tag, password, native: true }),
+        ...(web ? { credentials: "include" as RequestCredentials } : {}),
       });
       const text = await res.text();
       let json: any = null;
@@ -174,6 +186,7 @@ export const useAuthStore = create<AuthState>((set, get) => ({
       }
       const { accessToken, refreshToken, account } = json;
       if (refreshToken) await setRefreshToken(refreshToken);
+      if (web) await deleteRefreshToken(); // purge legacy insecure key, if any
       setAccessTokenMemory(accessToken);
       set({
         status: "authenticated",
@@ -195,6 +208,9 @@ export const useAuthStore = create<AuthState>((set, get) => ({
   logout: async () => {
     const token = get().accessToken || getAccessTokenMemory();
     const refresh = await getRefreshToken();
+    // PBS-BUG-036: web sends the HttpOnly cookie (credentials:include) so the
+    // server can revoke the cookie session; getRefreshToken() is null on web.
+    const web = isWebPlatform();
     try {
       const base = getApiBaseUrl();
       // Best effort: send both header and body
@@ -207,6 +223,7 @@ export const useAuthStore = create<AuthState>((set, get) => ({
           ...(refresh ? { "X-Refresh-Token": refresh } : {}),
         },
         body: JSON.stringify(refresh ? { refreshToken: refresh } : {}),
+        ...(web ? { credentials: "include" as RequestCredentials } : {}),
       });
     } catch (e) {
       console.warn("[auth] logout network error, still clearing locally", e);
@@ -228,6 +245,10 @@ export const useAuthStore = create<AuthState>((set, get) => ({
     set({ isLoading: true, error: null });
     try {
       const base = getApiBaseUrl();
+      // PBS-BUG-036: web includes credentials so the rotated HttpOnly cookie
+      // is stored by the browser; the response carries no JSON refresh token
+      // for web sessions, so the conditional persistence below is skipped.
+      const web = isWebPlatform();
       const res = await fetch(`${base}/api/rvb/auth/change-password`, {
         method: "POST",
         headers: {
@@ -236,6 +257,7 @@ export const useAuthStore = create<AuthState>((set, get) => ({
           Authorization: `Bearer ${token}`,
         },
         body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
+        ...(web ? { credentials: "include" as RequestCredentials } : {}),
       });
       const text = await res.text();
       let json: any = null;
```

MATCH proof: sec 79 verification.

## 50. Legacy sentinel cleanup result

`[chrome] F1-sentinel gone=true loginVisible=true` — seeded fake sentinel
vanishes on load; bootstrap never sends it (delete runs before any network;
anonymous result proves no auth derived). Service harness: web
`sentinelGone=true status=authenticated` (purged, then cookie restore
succeeds — purge-then-recover ordering proven).

## 51. Web login post-fix

`[chrome] F2-login resHasRefresh=false rlen=0 loginGone=true` — success,
authenticated UI, response carries NO refresh credential. Service harness:
`reqNative=(absent) resHasRefresh=false`.

## 52. Web storage non-persistence proof

`[chrome] F2-storage ls=[] ss=[] cookieVisible=""` — zero JS-readable
credential locations after login. Service harness: `lsKeys=(empty)`,
`secureCalls=[]` (SecureStore never invoked on web).

## 53. HttpOnly cookie proof

`[chrome] F2-cookie present=true httpOnly=true sameSite=Lax secure=false
path=/` — browser context metadata (value never recorded). `document.cookie`
cannot read it (sec 52 `cookieVisible=""`).

## 54. Web hard-reload restore

`[chrome] F3-reload loginVisible=false lsKeys=[]` — cold reload restores the
session from the cookie with no JS token anywhere. HARD FUNCTIONAL GATE
passes. Service harness (jar): `reload status=authenticated account=…`.

## 55. Web 401 refresh

`[chrome] F4-expired rowsFound=true netDelta=["GET /directory -> 401","POST
/auth/refresh -> 200","GET /directory -> 200"] lsKeys=[]` — expired access →
single cookie refresh → retry success → rows render → storage still clean.
Service harness: `retry {ok:true}` + `F5-concurrent refresh=1` (3×200).

## 56. Web concurrent refresh dedupe

Service harness: `F5-concurrent refresh=1 results=[3× ok]` both modes —
one underlying refresh, all retries succeed, no JS storage on web.

## 57. Web change-password result

Service harness web: `changepw ok=true storedFp=(null)` + `changepw-restore
status=authenticated` — rotation succeeds over cookie, restore works after.
No readable token created.

## 58. Web logout result

Module: `logout status=anonymous lsHas=false`; server revocation
`sessionDead=401/RVB_SESSION_REVOKED`; cookie-clearing response
`cleared=true`. Browser UI logout blocked by expo-Alert confirm dialog (no
buttons on web — product behavior unchanged pre/post; sec 81). Reload-after
would stay anonymous (cookie cleared server-side proven).

## 59. Web terminal failure result

Service harness: `F8-terminal status=anonymous refresh=1 lsClean=true` —
revoked session fails closed with no storage write and no resurrection.

## 60. Web transient failure result

Service harness: `F9-transient first={anonymous,refresh:1,lsClean:true}
retryStatus=authenticated retryRefresh=1` — 500 creates no fallback
persistence; healthy retry recovers via cookie. No "reliability" token cache.

## 61. Native login result

Android harness: `reqNative=native resHasRefresh=true` + SecureStore `set`
+ `lsKeys=(empty)` — native semantics fully retained, zero localStorage.

## 62. Native restore result

`reload status=authenticated` via SecureStore; rotation fingerprint changes
across reload (live source, not residue).

## 63. Native 401 refresh result

`retry {ok:true}` + SecureStore rotation persisted; dedupe `refresh=1`.

## 64. Native logout result

`secureCalls=[…get…delete]` + `sessionDead=401/RVB_SESSION_REVOKED` +
socket disconnect (code path unchanged).

## 65. Native change-password result

`ssRotated=true` (new token persisted to SecureStore) + post-rotation
restore authenticated.

## 66. Final token-storage grep

`localStorage.setItem/getItem` in `src/`: ONLY `ThemeProvider` theme mode
(non-secret) — zero credential occurrences. `secure-store.ts` retains only
`removeItem` (legacy cleanup — the single allowed use). No sessionStorage/
AsyncStorage/IndexedDB credential use. `refreshToken` JSON-field reads remain
only behind `if (…)` conditionals that are unsatisfiable on web (no-op
backstop) plus the native protocol that owns them.

## 67. Browser storage enumeration

Post-login+refresh+reload Chromium: localStorage `[]`, sessionStorage `[]`,
IndexedDB databases `[]`, `document.cookie` `""` (sec 14/52). No refresh
credential in any JS-visible store.

## 68. Platform response-shape proof

Web: `responseHasRefreshToken=FALSE` (F2). Native: `TRUE` with len=327 JWT
(harness both modes). Platform separation proven at the wire level.

## 69. PBS-BUG-034 preservation

`directory.service.ts` re-read post-cycle: `(res as any).items || …`
canonical extraction present (line 12). Unaltered.

## 70. PBS-BUG-035 preservation

`chat-socket.service.ts` (HSH web) untouched — not in scope, no diff. Mobile
`socket.ts` uses memory access token only (read sec: no refresh-credential
path) — untouched.

## 71. PBS-BUG-037 boundary

No role-routing/navigation/guard files touched. Only the 3 auth/storage
files differ.

## 72. Mobile socket regression

Socket connects post-login AND post-cookie-restore in Chromium
(`F21-srvSockets=1` server-side session socket). Access-token auth unchanged;
no refresh credential involved (code path untouched).

## 73. TypeScript

`npx tsc --noEmit` in `R.V.B-mobile`: exit 0 (post-fix, incl. after
dead-fallback removal).

## 74. Expo Doctor

`npx expo-doctor`: `21/21 checks passed`, exit 0 — baseline preserved, no
dependency changes.

## 75. Expo web export

`npx expo export --platform web --clear` (with API URL baked): success, exit
0 — the exact bundle under Chromium test. Generated `dist/` removed afterward
(disposable; invisible to superproject git under the gitlink path).

## 76. Chromium end-to-end flow

One browser context, post-fix bundle: fresh-clean → sentinel gone →
login(authenticated, no storage, httpOnly cookie) → search rows →
reload(restored, clean) → access expiry → search (401→refresh→retry→rows,
clean) → [sign-out UI blocked by expo-Alert-on-web confirm limitation;
logout proven at module+server level]. Console: only flow-normal 401s and
benign 404s (favicon/maps); zero pageerrors; zero credential logs.

## 77. HSH sync suite

`npm run test:hsh-sync` (backend): `34 passed, 0 failed`.

## 78. RVB auth/session regression tests

No existing runnable auth-session contract suite: `package.json` exposes only
`test:hsh-sync`; `test-rvb-integrity.ts` covers data-model integrity (no
login/refresh/logout flows). Nothing invented. Contract coverage for this
cycle = the disposable harness matrix (sec 50-65) + Chromium flow (sec 76),
whose evidence lines are quoted verbatim above.

## 79. Scope/diff/hash proof

Superproject git (mobile = gitlink, invisible): `git status` shows only
prior-cycle leftovers + this untracked audit; `git diff --check` exit 0; no
HSH file modified by this cycle (verified: full `git status --short` +
`git diff HEAD --name-only` contain no `H.S.H` entry).
Per-file: sec 18 baseline hashes vs sec 42/45/48 final hashes; BEFORE blocks
== snapshot bytes, AFTER blocks == worktree bytes, DIFF blocks ==
`git diff --no-index` snapshot→worktree — machine-verified below:

```text
BEFORE-SECURE MATCH
AFTER-SECURE MATCH
DIFF-SECURE MATCH
BEFORE-CLIENT MATCH
AFTER-CLIENT MATCH
DIFF-CLIENT MATCH
BEFORE-STORE MATCH
AFTER-STORE MATCH
DIFF-STORE MATCH
```

## 80. Disposable cleanup

Deleted post-evidence+verification: `tmp-pbs036-harness.ts`,
`tmp-pbs036-stubs/`, `tmp-pbs036-tsconfig.json`, `tmp-pbs036-chromium.ts`,
`TEMP-PBS-BUG-036-BEFORE/` (after embedding+verification),
`R.V.B-mobile/dist/`. Kept: this audit + 3-file production fix.

## 81. Remaining uncertainty

1. Real-device SecureStore (Keychain/Keystore) not exercised — emulator
   unavailable; native proof is module-level with a contract-faithful stub
   boundary (sec 26). Wrapper branching is the code under test and is fully
   covered.
2. Browser UI sign-out blocked by expo `Alert.alert` confirm having no
   actionable buttons on web (pre-existing product behavior, identical
   pre/post). Logout proven at module + server + cookie-header level; UI
   reload-after-logout not browser-observed.
3. Production cross-origin deployments (app/API on different hosts) need
   `CORS_ORIGIN` + `Secure`/`SameSite` cookie review at deploy time (sec 16);
   same-host/port-split verified here.
4. `RVB-MOBILE-CONTRACT.md` not rewritten (rule: quote, don't silently
   rewrite); the fix implements it. A contract touch-up noting Expo-Web
   cookie mode could follow in a docs pass.
5. Onboarding/refreshProfile request headers still carry inert `X-RVB-Client`
   (sec 34) — no credential effect (backend ignores it outside login);
   noted, not changed, to keep the security diff minimal.

## 82. Final status

FIXED — READY FOR GIORNO REVIEW
