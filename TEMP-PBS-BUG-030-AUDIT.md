# TEMP-PBS-BUG-030-AUDIT (PBS-BUG-030 — transient bootstrap/refresh clears local auth state)

Cycle scope: PBS-BUG-030 ONLY. PRE-FIX parent commit: `1ab2c05` (master, "049").
PBS-BUG-029 is CLOSED; its production fix is preserved and untouched.

## 1. Bug definition

`RvbAuthContext.loadMe()` catch block called `rvbAuthService.clearLocal()` +
`setUser(null)` for EVERY bootstrap error, including transient network/5xx
failures. Independently, `authFetch()`'s refresh-failure path called
`clearAccessToken()` + `notifyAuthFailure()`, whose context subscriber called
`clearLocal()` + `setUser(null)` — again for EVERY refresh failure, including
transient ones. Both paths destroyed durable local session state
(`rvb_has_session` hint, known user) without positive server evidence that the
server-side session died.

## 2. Why old 030 premise requires re-verification after 029

Old premise: "500 -> hint deleted -> permanent logout". PBS-BUG-029 added
`restoreSessionFromCookie()` + route-aware bootstrap: `/rvb` probes the
HttpOnly cookie even with no hint, so a transient failure on RVB can
auto-recover on pathname change (`/rvb` -> `/rvb/login` re-probe). HSH routes
keep the gated `refresh()` (quiet without hint). Therefore the RVB impact may
have narrowed to a transient flash, while HSH may strand a valid cookie
permanently (no probe ever runs there). Runtime had to prove what still breaks.

## 3. Current RvbAuthContext architecture

Global `RvbAuthProvider` (`H.S.H-V2.0.0/frontend/src/contexts/RvbAuthContext.tsx`):
`user`/`loading` state, `pathname` from `usePathname()`, `loadMe()` on
`[pathname]` change, `authFailure` subscription, `login`/`logout`/`refresh`/
`changePassword`/`completeOnboarding` callbacks, language sync effect on
`user?.id`. Pre-fix catch: unconditional `clearLocal()` + `setUser(null)`.

## 4. Current loadMe flow

1. `token = getAccessToken()` (memory-only; null after hard reload).
2. If token: `me()`; success -> `setUser`, done. Failure -> swallow, fall
   through to refresh (no state destruction at this stage).
3. `onRvbSurface = pathname === "/rvb" || startsWith("/rvb/")`.
4. RVB: `restoreSessionFromCookie()` (ungated probe). HSH: gated `refresh()`.
5. Success -> `setUser(account)`. Failure -> catch (PRE-FIX: unconditional
   clear). `finally`: `setLoading(false)`.

## 5. Current authFailure subscription flow

`authFetch`: non-401 -> return as-is. 401 -> ONE shared `getRefreshPromise()`
refresh + ONE retry. Refresh success -> retried response. Refresh failure ->
`clearAccessToken()` + `notifyAuthFailure()` -> context subscriber ->
`clearLocal()` + `setUser(null)`. PRE-FIX the notify fired for ANY refresh
error (500/network/terminal alike); the subscriber receives no error payload.

## 6. All clearLocal/setUser(null) call sites

`RvbAuthContext.tsx` (pre-fix): (a) `loadMe` catch — ANY bootstrap error;
(b) `subscribeAuthFailure` callback — ANY notified refresh failure (no error
visible). `rvb-auth.service.ts`: `clearLocal()` def (clears memory token +
hint + pendingRefresh); called from context (a),(b) and `logout()`.
`logout()` callback also `setUser(null)` (explicit logout — unconditional,
correct). `login` sets user on success only. No other `clearLocal` callers
exist in `frontend/src` (grep-verified).

## 7. Auth-service error shape

`handleResponse`: `err = Error(data?.code || data?.message || "Request failed
<status>")` with structured `err.code = data?.code`, `err.status = res.status`,
`err.data = data`. Network failure (fetch reject): raw `TypeError`, NO
`.status`/`.code`. 5xx: `{status: 500+, code: "INTERNAL_ERROR"|..., data}`.
401: `{status: 401, code: <server code>, data}`. 403: `{status: 403, code:
<RVB_ACCOUNT_ARCHIVED|RVB_ACCOUNT_DISABLED|RVB_FORBIDDEN>, data}`. Gated
refusal (no network): `{code: "RVB_NO_SESSION_HINT", status: 401}`. A reusable
classifier on structured `.code` is reliable; message matching is unnecessary.

## 8. Backend terminal-error matrix (source + runtime authoritative)

Backend: `H.S.H-V2.0.0/backend/src/routes/rvb-auth.ts` (refresh),
`src/middleware/rvb-auth.ts` (requireRvbAuth), `src/lib/rvb-auth.ts` (JWT).

| condition | endpoint | HTTP | code | session usable after? | retry recovers? | terminal cleanup? |
|---|---|---|---|---|---|---|
| missing refresh cookie | POST /refresh | 401 | RVB_REFRESH_REQUIRED | n/a (no credential) | no | yes (fail-closed noop) |
| malformed refresh JWT | POST /refresh | 401 | RVB_TOKEN_INVALID | no | no | yes |
| revoked/rotated refresh | POST /refresh | 401 | RVB_TOKEN_INVALID | no | no | yes |
| expired DB session | POST /refresh | 401 | RVB_TOKEN_EXPIRED | no | no | yes |
| unknown refresh hash | POST /refresh | 401 | RVB_TOKEN_INVALID | no | no | yes |
| disabled account | POST /refresh | 401 | RVB_TOKEN_INVALID | no | no | yes |
| archived account | POST /refresh | 401 | RVB_TOKEN_INVALID | no | no | yes |
| deleted account | POST /refresh | 401 | RVB_TOKEN_INVALID | no | no | yes |
| invalid access token | GET /me (mw) | 401 | RVB_TOKEN_INVALID | n/a (access only) | via refresh | refresh decides |
| revoked/expired session | GET /me (mw) | 401 | RVB_SESSION_REVOKED | no | no | yes |
| deleted account | GET /me (mw) | 401 | RVB_UNAUTHENTICATED | no | no | yes |
| no access token | GET /me (mw) | 401 | RVB_UNAUTHENTICATED | n/a | no | yes (noop) |
| disabled account | GET /me (mw) | 403 | RVB_ACCOUNT_DISABLED | no | no | yes |
| archived account | GET /me (mw) | 403 | RVB_ACCOUNT_ARCHIVED | no | no | yes |
| valid session + backend 500 | POST /refresh | 500 | INTERNAL_ERROR | YES (proven) | yes | NO |
| valid session + network failure | POST /refresh | — | — | YES | yes | NO |

Notes: archived/disabled surface as 401 RVB_TOKEN_INVALID on /refresh but as
403 RVB_ACCOUNT_ARCHIVED/RVB_ACCOUNT_DISABLED via middleware — both are in the
terminal set. The `/me` handler's 404 RVB_ACCOUNT_NOT_FOUND is unreachable
behind middleware (middleware 401s first on missing account) but is included
defensively: if ever emitted, the session is dead.

## 9. Terminal vs transient classification

TERMINAL (server proves session unusable -> clear local state):
`RVB_TOKEN_INVALID`, `RVB_TOKEN_EXPIRED`, `RVB_SESSION_REVOKED`,
`RVB_REFRESH_REQUIRED`, `RVB_UNAUTHENTICATED`, `RVB_ACCOUNT_ARCHIVED`,
`RVB_ACCOUNT_DISABLED`, `RVB_ACCOUNT_NOT_FOUND` (exact `.code` equality).
TRANSIENT (validity unknown/valid -> preserve): network `TypeError`
(no status/code), timeout/abort, HTTP 5xx, 429 `RVB_RATE_LIMIT`, `RVB_FORBIDDEN`
(403 role denial — session itself valid), `RVB_NO_SESSION_HINT` (client gate,
not server evidence), bare 401 without code, null/undefined, any unrecognized
code. UNKNOWN defaults to preservation (A5): destroying durable state requires
positive terminal evidence.

## 10. Mobile reference behavior

`R.V.B-mobile/src/stores/auth-store.ts` bootstrap: network failure -> keep
refresh token, show "Network unavailable"; 401 -> delete token; >=500 -> keep
token, "Server unavailable"; terminal codes
(`RVB_TOKEN_INVALID|RVB_TOKEN_EXPIRED|RVB_SESSION_REVOKED|RVB_REFRESH_REQUIRED`)
-> delete. `src/api/client.ts`: `isTerminalAuthCode` =
`RVB_SESSION_REVOKED|RVB_ACCOUNT_DISABLED|RVB_ACCOUNT_ARCHIVED|RVB_TOKEN_INVALID|RVB_TOKEN_EXPIRED`;
>=500 never deletes; network failure never deletes; 401 deletes. Web fix mirrors
this policy with the web-expanded source-proven set (sec 9). Mobile untouched.

## 11. PBS-BUG-029 interaction

If a transient error on `/rvb` deletes the hint (pre-fix), pathname change to
`/rvb/login` DOES trigger another cookie probe (loadMe depends on pathname,
029 probe is hint-independent) — so a one-shot 500 on RVB likely auto-recovers
today. A persistent 500 spanning both mount and redirect does NOT auto-recover
(no retry loop/timer); recovery needs reload/navigation after health returns —
but then the valid cookie restores via probe. Old "permanent logout" on RVB is
therefore largely mitigated by 029; the durable harm moved to HSH (no probe).

## 12. HSH-surface interaction

Scenario from the task (valid session+hint, hard reload on `/products`, one
refresh 500): pre-fix catch clears hint. Second healthy reload: gated
`refresh()` sees no hint -> throws `RVB_NO_SESSION_HINT` with ZERO network
requests; valid HttpOnly cookie stranded; sync idle (hint gate). PROVEN at
runtime (sec 17, F-B STRANDED). This is the strongest surviving 030 impact.

## 13. Sync-manager interaction

`frontend/src/services/sync/manager.ts` `syncCycle()` gates ONLY on the
`rvb_has_session` hint (lines 291-299); it never requires an in-memory access
token. `sync/client.ts` sends NO `Authorization` header on any `/api/sync`
call (verified by full read). Server `backend/src/routes/sync.ts` mounts NO
`requireRvbAuth` middleware. Runtime proof (G5): `/api/sync/bootstrap`,
`/changes`, POST `/api/sync` all return 200 with no credentials. Therefore
preserving the hint after a transient bootstrap failure CANNOT create a 401
storm — worst case is normal unauthenticated sync traffic, which is the
intended behavior while a session may exist. NO sync-manager change required.

## 14. Explicit logout contract

`logout()`: best-effort server revoke (cookie or access-token session),
then UNCONDITIONAL `clearAccessToken()` + `clearSessionHint()` +
`pendingRefresh = null`; context `setUser(null)`. Post-fix runtime (G4):
hint absent, token null, cookie jar cleared, post-logout probe fails terminal
`RVB_REFRESH_REQUIRED`. 030 classifier is never consulted on this path.
Preserved.

## 15. Runtime environment

Real backend (express mounting the REAL `rvb-auth` + `sync` routers, real
models/JWT) on `mongodb-memory-server` replSet. Real frontend
`rvb-auth.service.ts` module imported from source over HTTP with a Node cookie
jar (HttpOnly semantics) + `localStorage` shim. Node 22 `fetch` performs the
same refresh/authFetch logic as Chromium for these paths; the React context
catch/subscriber is a 3-line mapping replicated exactly in-harness pre-fix
(unconditional clear) and via the real exported classifier post-fix. Full
Chromium E2E was judged disproportionate: no DOM/guard behavior is under test,
only service error shape -> durable-state decisions. (See sec 75.)

## 16. Valid-session control

`[pbs030] B1-login {"status":200,"code":null,"hasAccess":true,"setCookie":true}`
`[pbs030] B1-refresh-healthy {"status":200,"code":null,"hasAccess":true}`
`[pbs030] F-A-login hint=1 token=set user=set` — login sets cookie + hint +
memory token; healthy refresh succeeds.

## 17. HSH one-shot 500 baseline (PRE-FIX, real service + real backend)

`[pbs030] F-B-prereload hint=1 token=null user=null`
`[pbs030] F-B-refresh-500 err-status=500 code=INTERNAL_ERROR ctx=cleared hint=(absent) user=null refreshHits=1`
One transient 500 destroyed the hint although the server session stayed valid.

## 18. HSH network-failure baseline (PRE-FIX)

`[pbs030] F-C-network err-status=(none) code=fetch failed ctx=cleared hint=(absent)`
Browser-visible network failure (`TypeError`, no status/code) also destroyed
the hint. Same root cause.

## 19. HSH second-reload recovery baseline (PRE-FIX)

`[pbs030] F-B-second-reload STRANDED err-code=RVB_NO_SESSION_HINT hint=(absent) refreshHits=0 cookieInJar=true`
Healthy backend, valid cookie still present, but gated refresh attempted ZERO
requests: valid server session stranded, user unrestorable on HSH, sync idle.
030 survives 029 on HSH exactly as narrowed in sec 11/12.

## 20. RVB one-shot 500 baseline

Not separately executed in a browser; by code + 029 semantics (sec 11):
`/rvb` mount 500 -> catch clears hint/user -> guard redirects `/rvb/login` ->
pathname change re-runs loadMe -> 029 probe restores from the still-valid
cookie (one-shot already over). Transient user-null flash + redirect, then
auto-recovery. Honestly recorded: old permanent-logout does NOT reproduce on
RVB for a one-shot failure; HSH stranding (sec 19) is the durable defect.

## 21. RVB persistent-transient baseline

By architecture (no retry loop/timer in provider): failures spanning mount +
`/rvb/login` probe settle logged-out; no self-retry after recovery without
reload/navigation. After health returns, reload/navigation recovers via 029
probe PRE-FIX too (cookie intact) — but on HSH there is no probe, so the
pre-fix hint deletion there is permanent (sec 19). Post-fix, hint preservation
additionally allows recovery without any RVB visit.

## 22. Terminal invalid-session baseline

Backend matrix (sec 8, 17 cases incl.): revoked -> 401 RVB_TOKEN_INVALID;
garbage -> 401 RVB_TOKEN_INVALID; no cookie -> 401 RVB_REFRESH_REQUIRED.
Web Path B (F-F PRE-FIX): revoked sessions -> `notified=1`, hint cleared, user
null — CORRECT fail-closed behavior that the fix must preserve (it does, sec 58).

## 23. Expired-refresh baseline

`refresh-expired-db {"status":401,"code":"RVB_TOKEN_EXPIRED"}` — backdated
`expiresAt` yields the distinct terminal code; classifier treats as terminal.

## 24. Disabled-account baseline

`refresh-disabled-account {"status":401,"code":"RVB_TOKEN_INVALID"}` +
`me-disabled-account {"status":403,"code":"RVB_ACCOUNT_DISABLED"}`. Both codes
terminal per sec 9. (Login masks disabled as generic invalid credentials —
login path never clears session state, unaffected.)

## 25. Archived-account baseline

`refresh-archived-account {"status":401,"code":"RVB_TOKEN_INVALID"}` +
`me-archived-account {"status":403,"code":"RVB_ACCOUNT_ARCHIVED"}`. Both
terminal.

## 26. AuthFetch transient-500 baseline (PRE-FIX, Path B)

`[pbs030] F-D-authFetch-500 http=401 notified=1 hint=(absent) user=null token=null`
Mid-session: corrupt access -> service 401 -> refresh 500 -> `notifyAuthFailure`
fired -> durable hint + known user destroyed although the server session was
valid. Path B PROVEN to share the 030 root cause and belong in this cycle.

## 27. AuthFetch network-failure baseline

Same mechanism as sec 26 with fetch rejection: refresh throws `TypeError` (no
status/code) -> pre-fix unconditional notify -> clear. Covered by the same
code path (`catch (e)` around `getRefreshPromise()`); classifier returns false
for codeless errors (G1 matrix). No separate run needed beyond F-C + G1.

## 28. AuthFetch terminal-failure baseline

`[pbs030] F-F-terminal http=401 notified=1 hint=(absent) user=null`
(All server sessions revoked + corrupt access.) Notify + clear is CORRECT here.

## 29. Existing-user transient behavior

Pre-fix BOTH paths nulled a known user on transient errors (F-D: `user=set` ->
`user=null`). Post-fix (sec 60): known user preserved on transient refresh
failure; cold bootstrap still settles `user === null` (no fabricated state)
until a retry succeeds.

## 30. HSH no-session quiet control

`[pbs030] F-G-quiet err-code=RVB_NO_SESSION_HINT refreshHits=0` — no hint/token
-> gated refusal, zero network. Unchanged post-fix (`RVB_NO_SESSION_HINT` is
non-terminal; preservation is a noop here).

## 31. PBS-BUG-029 restore control

`[pbs030] G2-restore ok user=pbs030sup hint=1` — valid cookie + no hint +
`restoreSessionFromCookie()` restores and re-sets hint. Post-fix, unchanged.

## 32. PBS-BUG-028 success control

`[pbs030] F-E-028 http=200 ok=true refreshHits=1 notified=0 hint=1 user=set` —
expired access + healthy refresh: 401 -> exactly 1 refresh -> retry 200, no
notification. Post-fix identical.

## 33. Decision-gate result

CASE 3 — bootstrap catch AND authFetch/notify path share the same
unclassified-refresh-failure root cause; runtime (sec 17/19/26) proves BOTH
destroy durable session state on transient errors. Fix both, nothing else.

## 34. Exact CURRENT root cause

Two call sites destroy durable local auth state on ANY error instead of only
on positive terminal evidence: (1) `loadMe` catch (`RvbAuthContext.tsx`
pre-fix lines 50-53); (2) `authFetch` catch (`rvb-auth.service.ts` pre-fix
lines 297-301) via unconditional `notifyAuthFailure()`.

## 35. Exact affected paths

Path A (bootstrap): HSH one-shot/network refresh failure -> hint destroyed ->
valid-cookie stranding + sync idle (sec 19); RVB transient user-null flash.
Path B (mid-session `authFetch`): transient refresh failure -> notified logout
(sec 26). Both fixed.

## 36. Exact unaffected paths

`me()`-failure fall-through (no destruction), gated `RVB_NO_SESSION_HINT`
refusal, `restoreSessionFromCookie` semantics, 028 dedupe/single-retry,
`login`/`logout`, sync manager/queue/server, chat-socket, mobile, backend.

## 37. Fix architecture

One shared classifier `isTerminalRvbAuthError(error)` in
`rvb-auth.service.ts` (used by both context and service). `loadMe` catch
clears ONLY if terminal. `authFetch` catch always drops the rejected cached
access token but notifies ONLY if terminal (classification before notify, so
the payload-less subscriber stays unconditionally clearing and remains
correct). No retry loops added; no new storage; no backend/mobile changes.

## 38. Error-classification design

Exact `.code` set membership (sec 9), `unknown`-typed parameter (no `any`),
no message substring matching, no blanket 401/403 rule (`RVB_FORBIDDEN` 403
and `RVB_RATE_LIMIT` 429 are non-terminal by test). Unknown/absent codes
default to preservation.

## 39. Bootstrap transient behavior

Preserve hint, HttpOnly cookie (untouched — client never deletes it except
server `clearCookie` on logout), and existing user; `loading` still settles
false; cold bootstrap stays `user === null`; next reload/navigation retries
normally. Proven: F-B post-fix `ctx=preserved hint=1`, second reload 200.

## 40. Bootstrap terminal behavior

Unchanged fail-closed: `clearLocal()` + `setUser(null)` + guard/login flow.
Proven: F-F post-fix `notified=1 hint=(absent) user=null`; G4 post-logout
probe `RVB_REFRESH_REQUIRED`.

## 41. AuthFetch failure-policy behavior

Protected 401 + successful refresh -> single retry (028 intact). Refresh
failure: drop cached access token (it was just rejected), notify ONLY if the
refresh error is terminal, return the ORIGINAL 401 response so the caller
surfaces failure without logout. No loop (single shared promise, single
retry — untouched).

## 42. Sync-manager consequence/design

No change (sec 13 + G5). Hint remains a session-possibility marker; sync
traffic is server-unauthenticated, so hint preservation cannot produce auth
noise. Local/offline HSH CRUD, queue semantics, 012-015 logic, server sync
all untouched (sync suite 34/0, sec 71).

## 43. Permanent files changed

1. `H.S.H-V2.0.0/frontend/src/contexts/RvbAuthContext.tsx` (catch gate +
   subscriber invariant comment + import).
2. `H.S.H-V2.0.0/frontend/src/services/rvb-auth.service.ts` (classifier +
   authFetch notify gate).
No backend, mobile, socket, sync, or config changes. Disposable 029 audit
deleted per cycle cleanup; all `tmp-pbs030*` harness files removed.

## 44. COMPLETE FULL BEFORE — file 1

A. Path: `H.S.H-V2.0.0/frontend/src/contexts/RvbAuthContext.tsx`
B. Full before body (PRE-FIX parent `1ab2c05` blob
   `cd7ac08448c696547cf3c0dc84cab44c67cb34b3`):

<!-- BLOCK:BEFORE-CTX -->
```tsx
"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { rvbAuthService, type RvbSafeUser } from "../services/rvb-auth.service";

type RvbAuthState = {
  user: RvbSafeUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (tag: string, password: string) => Promise<RvbSafeUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  changePassword: (payload: { currentPassword: string; newPassword: string; confirmPassword: string }) => Promise<void>;
  completeOnboarding: (profilePicture: string) => Promise<RvbSafeUser>;
  setUser: (u: RvbSafeUser | null) => void;
};

const Ctx = createContext<RvbAuthState | null>(null);

export function RvbAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<RvbSafeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  const loadMe = useCallback(async () => {
    // Access token is memory-only: on full refresh it is null — restore via HttpOnly refresh cookie
    const token = rvbAuthService.getAccessToken();
    if (token) {
      try {
        const me = await rvbAuthService.me();
        setUser(me);
        setLoading(false);
        return;
      } catch {
        // access expired, fall through to refresh
      }
    }
    // No token or me failed → attempt silent refresh using HttpOnly cookie.
    // PBS-BUG-029: on the RVB surface allow ONE explicit cookie probe even when
    // the local hint is absent (hint is an optimization, not proof of absence).
    // Ordinary HSH routes keep the gated refresh() so unauthenticated pages
    // stay quiet with zero refresh traffic.
    const onRvbSurface = pathname === "/rvb" || pathname.startsWith("/rvb/");
    try {
      const refreshed = onRvbSurface
        ? await rvbAuthService.restoreSessionFromCookie()
        : await rvbAuthService.refresh();
      setUser(refreshed.account);
    } catch {
      rvbAuthService.clearLocal();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [pathname]);

  useEffect(() => { void loadMe(); }, [loadMe]);

  // After user is set, sync presentation language from account (authoritative)
  useEffect(() => {
    if (user) {
      (async () => {
        try {
          const { rvbUiPreferencesService } = await import("../services/rvb-ui-preferences.service");
          await rvbUiPreferencesService.syncFromAccount();
        } catch {}
      })();
    }
  }, [user?.id]);

  useEffect(() => {
    const unsub = rvbAuthService.subscribeAuthFailure(() => {
      rvbAuthService.clearLocal();
      setUser(null);
    });
    return unsub;
  }, []);

  const login = useCallback(async (tag: string, password: string) => {
    const res = await rvbAuthService.login(tag, password);
    setUser(res.account);
    try {
      const { rvbUiPreferencesService } = await import("../services/rvb-ui-preferences.service");
      await rvbUiPreferencesService.syncFromAccount();
    } catch {}
    return res.account;
  }, []);

  const logout = useCallback(async () => {
    await rvbAuthService.logout();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const data = await rvbAuthService.refresh();
    setUser(data.account);
  }, []);

  const changePassword = useCallback(async (payload: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
    const data = await rvbAuthService.changePassword(payload);
    if (data.account) setUser(data.account);
  }, []);

  const completeOnboarding = useCallback(async (profilePicture: string) => {
    const account = await rvbAuthService.onboarding(profilePicture);
    setUser(account as RvbSafeUser);
    return account as RvbSafeUser;
  }, []);

  const value = useMemo<RvbAuthState>(() => ({
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    refresh,
    changePassword,
    completeOnboarding,
    setUser,
  }), [user, loading, login, logout, refresh, changePassword, completeOnboarding]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRvbAuth(): RvbAuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRvbAuth must be used within RvbAuthProvider");
  return ctx;
}
```

## 45. COMPLETE FULL AFTER — file 1

C. Full after body (working tree, git object
`e1e8155c48fea8ffd4b6b6271e5205158a2cafee`):

<!-- BLOCK:AFTER-CTX -->
```tsx
"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { rvbAuthService, isTerminalRvbAuthError, type RvbSafeUser } from "../services/rvb-auth.service";

type RvbAuthState = {
  user: RvbSafeUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (tag: string, password: string) => Promise<RvbSafeUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  changePassword: (payload: { currentPassword: string; newPassword: string; confirmPassword: string }) => Promise<void>;
  completeOnboarding: (profilePicture: string) => Promise<RvbSafeUser>;
  setUser: (u: RvbSafeUser | null) => void;
};

const Ctx = createContext<RvbAuthState | null>(null);

export function RvbAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<RvbSafeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  const loadMe = useCallback(async () => {
    // Access token is memory-only: on full refresh it is null — restore via HttpOnly refresh cookie
    const token = rvbAuthService.getAccessToken();
    if (token) {
      try {
        const me = await rvbAuthService.me();
        setUser(me);
        setLoading(false);
        return;
      } catch {
        // access expired, fall through to refresh
      }
    }
    // No token or me failed → attempt silent refresh using HttpOnly cookie.
    // PBS-BUG-029: on the RVB surface allow ONE explicit cookie probe even when
    // the local hint is absent (hint is an optimization, not proof of absence).
    // Ordinary HSH routes keep the gated refresh() so unauthenticated pages
    // stay quiet with zero refresh traffic.
    const onRvbSurface = pathname === "/rvb" || pathname.startsWith("/rvb/");
    try {
      const refreshed = onRvbSurface
        ? await rvbAuthService.restoreSessionFromCookie()
        : await rvbAuthService.refresh();
      setUser(refreshed.account);
    } catch (e) {
      // PBS-BUG-030: destroy local session state ONLY on positive server
      // evidence the session is terminal (see isTerminalRvbAuthError).
      // Transient bootstrap failures (network/5xx) preserve the hint, the
      // HttpOnly cookie, and any already-known user so a later retry/reload
      // can recover. Cold bootstrap simply stays user === null.
      if (isTerminalRvbAuthError(e)) {
        rvbAuthService.clearLocal();
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, [pathname]);

  useEffect(() => { void loadMe(); }, [loadMe]);

  // After user is set, sync presentation language from account (authoritative)
  useEffect(() => {
    if (user) {
      (async () => {
        try {
          const { rvbUiPreferencesService } = await import("../services/rvb-ui-preferences.service");
          await rvbUiPreferencesService.syncFromAccount();
        } catch {}
      })();
    }
  }, [user?.id]);

  useEffect(() => {
    // PBS-BUG-030: authFetch notifies ONLY after a terminal refresh failure
    // (classification happens before notifyAuthFailure), so an unconditional
    // clear here remains correct. Transient refresh failures never notify.
    const unsub = rvbAuthService.subscribeAuthFailure(() => {
      rvbAuthService.clearLocal();
      setUser(null);
    });
    return unsub;
  }, []);

  const login = useCallback(async (tag: string, password: string) => {
    const res = await rvbAuthService.login(tag, password);
    setUser(res.account);
    try {
      const { rvbUiPreferencesService } = await import("../services/rvb-ui-preferences.service");
      await rvbUiPreferencesService.syncFromAccount();
    } catch {}
    return res.account;
  }, []);

  const logout = useCallback(async () => {
    await rvbAuthService.logout();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const data = await rvbAuthService.refresh();
    setUser(data.account);
  }, []);

  const changePassword = useCallback(async (payload: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
    const data = await rvbAuthService.changePassword(payload);
    if (data.account) setUser(data.account);
  }, []);

  const completeOnboarding = useCallback(async (profilePicture: string) => {
    const account = await rvbAuthService.onboarding(profilePicture);
    setUser(account as RvbSafeUser);
    return account as RvbSafeUser;
  }, []);

  const value = useMemo<RvbAuthState>(() => ({
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    refresh,
    changePassword,
    completeOnboarding,
    setUser,
  }), [user, loading, login, logout, refresh, changePassword, completeOnboarding]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRvbAuth(): RvbAuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRvbAuth must be used within RvbAuthProvider");
  return ctx;
}
```

## 46. COMPLETE DIFF — file 1

D. Literal unified diff (`git diff HEAD -- <file 1>`, first hunk block of sec 51):

<!-- BLOCK:DIFF-CTX -->
```diff
diff --git a/H.S.H-V2.0.0/frontend/src/contexts/RvbAuthContext.tsx b/H.S.H-V2.0.0/frontend/src/contexts/RvbAuthContext.tsx
index cd7ac08..e1e8155 100644
--- a/H.S.H-V2.0.0/frontend/src/contexts/RvbAuthContext.tsx
+++ b/H.S.H-V2.0.0/frontend/src/contexts/RvbAuthContext.tsx
@@ -2,7 +2,7 @@
 
 import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
 import { usePathname } from "next/navigation";
-import { rvbAuthService, type RvbSafeUser } from "../services/rvb-auth.service";
+import { rvbAuthService, isTerminalRvbAuthError, type RvbSafeUser } from "../services/rvb-auth.service";
 
 type RvbAuthState = {
   user: RvbSafeUser | null;
@@ -47,9 +47,16 @@ export function RvbAuthProvider({ children }: { children: React.ReactNode }) {
         ? await rvbAuthService.restoreSessionFromCookie()
         : await rvbAuthService.refresh();
       setUser(refreshed.account);
-    } catch {
-      rvbAuthService.clearLocal();
-      setUser(null);
+    } catch (e) {
+      // PBS-BUG-030: destroy local session state ONLY on positive server
+      // evidence the session is terminal (see isTerminalRvbAuthError).
+      // Transient bootstrap failures (network/5xx) preserve the hint, the
+      // HttpOnly cookie, and any already-known user so a later retry/reload
+      // can recover. Cold bootstrap simply stays user === null.
+      if (isTerminalRvbAuthError(e)) {
+        rvbAuthService.clearLocal();
+        setUser(null);
+      }
     } finally {
       setLoading(false);
     }
@@ -70,6 +77,9 @@ export function RvbAuthProvider({ children }: { children: React.ReactNode }) {
   }, [user?.id]);
 
   useEffect(() => {
+    // PBS-BUG-030: authFetch notifies ONLY after a terminal refresh failure
+    // (classification happens before notifyAuthFailure), so an unconditional
+    // clear here remains correct. Transient refresh failures never notify.
     const unsub = rvbAuthService.subscribeAuthFailure(() => {
       rvbAuthService.clearLocal();
       setUser(null);
```

## 47. COMPLETE FULL BEFORE — file 2

A. Path: `H.S.H-V2.0.0/frontend/src/services/rvb-auth.service.ts`
B. Full before body (PRE-FIX parent `1ab2c05` blob
   `c62d761f6d45dfc3b255e3ef634aca348d1eb59b`):

<!-- BLOCK:BEFORE-SVC -->
```ts
"use client";

import type { RvbAccount } from "../types/rvb/rvb-account";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";

const AUTH_BASE = `${API_BASE}/api/rvb/auth`;

// In-memory access token only — never persisted
let memoryAccessToken: string | null = null;
let pendingRefresh: Promise<{ accessToken: string; account: RvbSafeUser }> | null = null;

const RVB_SESSION_HINT_KEY = "rvb_has_session";

function hasSessionHint(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(RVB_SESSION_HINT_KEY) === "1";
  } catch {
    return false;
  }
}
function setSessionHint(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(RVB_SESSION_HINT_KEY, "1");
  } catch {}
}
function clearSessionHint(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(RVB_SESSION_HINT_KEY);
  } catch {}
}

// Small subscription to allow authFetch to notify context when refresh fails
type AuthFailureListener = () => void;
const authFailureListeners = new Set<AuthFailureListener>();

function notifyAuthFailure() {
  authFailureListeners.forEach((cb) => {
    try { cb(); } catch {}
  });
}

function getAccessToken(): string | null {
  return memoryAccessToken;
}
function setAccessToken(token: string | null) {
  memoryAccessToken = token;
}

function clearAccessToken() {
  memoryAccessToken = null;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data?.code || data?.message || `Request failed ${res.status}`);
    err.code = data?.code;
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export type RvbSafeUser = RvbAccount & { mustChangePassword?: boolean };

async function doRefreshRequest(): Promise<{ accessToken: string; account: RvbSafeUser }> {
  const res = await fetch(`${AUTH_BASE}/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // No refreshToken in body — cookie only for web
    body: JSON.stringify({}),
    credentials: "include",
  });
  const data = await handleResponse<{ success: boolean; accessToken: string; refreshToken?: string; account: RvbSafeUser }>(res);
  // Web ignores returned refreshToken (HttpOnly cookie is the source of truth)
  if (data.accessToken) setAccessToken(data.accessToken);
  return { accessToken: data.accessToken, account: data.account };
}

function getRefreshPromise(): Promise<{ accessToken: string; account: RvbSafeUser }> {
  if (!pendingRefresh) {
    pendingRefresh = doRefreshRequest().finally(() => {
      pendingRefresh = null;
    });
  }
  return pendingRefresh;
}

export const rvbAuthService = {
  getAccessToken,
  // Exposed for services that need Authorization header; no setter for refresh
  _setAccessToken: setAccessToken,

  subscribeAuthFailure(listener: AuthFailureListener): () => void {
    authFailureListeners.add(listener);
    return () => authFailureListeners.delete(listener);
  },

  async login(tag: string, password: string): Promise<{ accessToken: string; account: RvbSafeUser; mustChangePassword?: boolean }> {
    const res = await fetch(`${AUTH_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag, password }),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; accessToken: string; refreshToken?: string; account: RvbSafeUser; mustChangePassword?: boolean }>(res);
    if (data.accessToken) setAccessToken(data.accessToken);
    // Intentionally ignore data.refreshToken — HttpOnly cookie holds it for web
    // Set non-sensitive hint that a session may exist (for silent refresh gating, not token content)
    setSessionHint();
    return { accessToken: data.accessToken, account: data.account, mustChangePassword: data.mustChangePassword };
  },

  async refresh(): Promise<{ accessToken: string; account: RvbSafeUser }> {
    // Gated refresh: do not attempt if no hint that a session may exist (prevents pointless 401 loop)
    // Hint is non-sensitive local marker, not HttpOnly cookie content.
    if (!getAccessToken() && !hasSessionHint()) {
      throw Object.assign(new Error("RVB_NO_SESSION_HINT"), { code: "RVB_NO_SESSION_HINT", status: 401 });
    }
    const result = await getRefreshPromise();
    // Refresh succeeded → ensure hint persists
    setSessionHint();
    return result;
  },

  // Direct refresh without dedup (used by context init with same dedup)
  async refreshSession(): Promise<{ accessToken: string; account: RvbSafeUser }> {
    if (!getAccessToken() && !hasSessionHint()) {
      throw Object.assign(new Error("RVB_NO_SESSION_HINT"), { code: "RVB_NO_SESSION_HINT", status: 401 });
    }
    const result = await getRefreshPromise();
    setSessionHint();
    return result;
  },

  // PBS-BUG-029: explicit cookie-probe restore for RVB-surface bootstrap only.
  // Same shared refresh promise as refresh(); differs ONLY by skipping the
  // no-hint pre-network refusal. The hint stays an optimization (not proof of
  // session absence): a valid HttpOnly cookie must be recoverable when entering
  // RVB even if the hint disappeared. Default refresh() keeps the quiet gate
  // for callers that must not probe (global HSH mounts). Success re-sets the
  // hint through the existing path.
  async restoreSessionFromCookie(): Promise<{ accessToken: string; account: RvbSafeUser }> {
    const result = await getRefreshPromise();
    setSessionHint();
    return result;
  },

  async logout(): Promise<void> {
    const accessToken = getAccessToken();
    try {
      await fetch(`${AUTH_BASE}/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        // No refreshToken in body — cookie only; mobile would send body, web doesn't
        body: JSON.stringify({}),
        credentials: "include",
      });
    } catch {}
    clearAccessToken();
    clearSessionHint();
    pendingRefresh = null;
  },

  async me(): Promise<RvbSafeUser> {
    const token = getAccessToken();
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/me`, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
      cache: "no-store",
    });
    const data = await handleResponse<{ success: boolean; account: RvbSafeUser }>(res);
    return data.account;
  },

  async changePassword(payload: { currentPassword: string; newPassword: string; confirmPassword: string }): Promise<{ accessToken?: string; account: RvbSafeUser }> {
    const token = getAccessToken();
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; accessToken?: string; refreshToken?: string; account: RvbSafeUser }>(res);
    if (data.accessToken) setAccessToken(data.accessToken);
    // Ignore refreshToken for web (native handled via session metadata)
    return { accessToken: data.accessToken, account: data.account };
  },

  async onboarding(profilePicture: string): Promise<RvbSafeUser> {
    const token = getAccessToken();
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/onboarding`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ profilePicture }),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; account: RvbSafeUser }>(res);
    return data.account;
  },

  async updateProfile(payload: { displayName?: string; profilePicture?: string | null }): Promise<RvbSafeUser> {
    const token = getAccessToken();
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; account: RvbSafeUser }>(res);
    return data.account;
  },

  async getPreferences(): Promise<{ notifications: Record<string, boolean>; ui?: { language?: string; theme?: string } }> {
    const token = getAccessToken();
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/preferences`, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
      cache: "no-store",
    });
    const data = await handleResponse<{ success: boolean; preferences: any }>(res);
    return data.preferences;
  },

  async updatePreferences(prefs: Record<string, boolean> | { notifications?: Record<string, boolean>; ui?: { language?: string; theme?: string } }): Promise<any> {
    const token = getAccessToken();
    // Backward compat: if plain notifications map passed without wrapper keys
    let body: any;
    if (prefs && typeof prefs === "object" && ("notifications" in (prefs as any) || "ui" in (prefs as any))) {
      body = prefs;
    } else {
      body = { notifications: prefs };
    }
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/preferences`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; preferences: any }>(res);
    return data.preferences;
  },

  async getSessions(): Promise<{ sessions: any[]; currentSessionId: string }> {
    const token = getAccessToken();
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/sessions`, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
      cache: "no-store",
    });
    const data = await handleResponse<{ success: boolean; sessions: any[]; currentSessionId: string }>(res);
    return data;
  },

  async revokeOtherSessions(): Promise<void> {
    const token = getAccessToken();
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/sessions/revoke-others`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    });
    await handleResponse(res);
  },

  async authFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    const token = getAccessToken();
    const headers: any = { ...(init?.headers as any) };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(input, { ...init, headers, credentials: "include" as any });
    if (res.status !== 401) return res;
    // One retry with single shared refresh
    try {
      const refreshed = await getRefreshPromise();
      const retryHeaders: any = { ...(init?.headers as any), Authorization: `Bearer ${refreshed.accessToken}` };
      return fetch(input, { ...init, headers: retryHeaders, credentials: "include" as any });
    } catch {
      clearAccessToken();
      notifyAuthFailure();
      return res;
    }
  },

  clearLocal() {
    clearAccessToken();
    clearSessionHint();
    pendingRefresh = null;
  },

  hasSessionHint() {
    return hasSessionHint();
  },

  _notifyAuthFailureForTest() {
    notifyAuthFailure();
  },
};
```

## 48. COMPLETE FULL AFTER — file 2

C. Full after body (working tree, git object
`7e3e0c31114cdb7f736e227cb1673a17371cdd30`):

<!-- BLOCK:AFTER-SVC -->
```ts
"use client";

import type { RvbAccount } from "../types/rvb/rvb-account";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";

const AUTH_BASE = `${API_BASE}/api/rvb/auth`;

// In-memory access token only — never persisted
let memoryAccessToken: string | null = null;
let pendingRefresh: Promise<{ accessToken: string; account: RvbSafeUser }> | null = null;

const RVB_SESSION_HINT_KEY = "rvb_has_session";

function hasSessionHint(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(RVB_SESSION_HINT_KEY) === "1";
  } catch {
    return false;
  }
}
function setSessionHint(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(RVB_SESSION_HINT_KEY, "1");
  } catch {}
}
function clearSessionHint(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(RVB_SESSION_HINT_KEY);
  } catch {}
}

// PBS-BUG-030: source-authoritative terminal-vs-transient classifier.
// Local authentication/session state (hint + known user) may be destroyed
// automatically ONLY on positive server evidence that the current session can
// no longer be used. A temporary inability to verify the session (network
// failure, timeout, 5xx, rate limit, unrecognized error) MUST NOT destroy it.
//
// Terminal set derived from CURRENT backend contracts (routes/rvb-auth.ts +
// middleware/rvb-auth.ts, proven by PBS-BUG-030 runtime matrix):
//   POST /api/rvb/auth/refresh -> 401 RVB_REFRESH_REQUIRED (no cookie)
//                              401 RVB_TOKEN_INVALID (malformed / revoked /
//                                  unknown / disabled / archived / deleted)
//                              401 RVB_TOKEN_EXPIRED (expired DB session)
//   requireRvbAuth (/me, ...)  -> 401 RVB_TOKEN_INVALID (bad access token)
//                              401 RVB_SESSION_REVOKED (revoked/expired session)
//                              401 RVB_UNAUTHENTICATED (no token / no account)
//                              403 RVB_ACCOUNT_ARCHIVED / RVB_ACCOUNT_DISABLED
//                              404 RVB_ACCOUNT_NOT_FOUND (defensive: the /me
//                                  handler emits it; middleware 401 fires first)
// Deliberately NOT terminal: 5xx, network errors, 429 RVB_RATE_LIMIT,
// 403 RVB_FORBIDDEN (role authorization — session itself is still valid),
// RVB_NO_SESSION_HINT (client-side gate, not server evidence), and any
// unrecognized code (UNKNOWN defaults to preservation).
const TERMINAL_RVB_AUTH_CODES = new Set([
  "RVB_TOKEN_INVALID",
  "RVB_TOKEN_EXPIRED",
  "RVB_SESSION_REVOKED",
  "RVB_REFRESH_REQUIRED",
  "RVB_UNAUTHENTICATED",
  "RVB_ACCOUNT_ARCHIVED",
  "RVB_ACCOUNT_DISABLED",
  "RVB_ACCOUNT_NOT_FOUND",
]);

export function isTerminalRvbAuthError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" && TERMINAL_RVB_AUTH_CODES.has(code);
}

// Small subscription to allow authFetch to notify context when refresh fails
type AuthFailureListener = () => void;
const authFailureListeners = new Set<AuthFailureListener>();

function notifyAuthFailure() {
  authFailureListeners.forEach((cb) => {
    try { cb(); } catch {}
  });
}

function getAccessToken(): string | null {
  return memoryAccessToken;
}
function setAccessToken(token: string | null) {
  memoryAccessToken = token;
}

function clearAccessToken() {
  memoryAccessToken = null;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data?.code || data?.message || `Request failed ${res.status}`);
    err.code = data?.code;
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export type RvbSafeUser = RvbAccount & { mustChangePassword?: boolean };

async function doRefreshRequest(): Promise<{ accessToken: string; account: RvbSafeUser }> {
  const res = await fetch(`${AUTH_BASE}/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // No refreshToken in body — cookie only for web
    body: JSON.stringify({}),
    credentials: "include",
  });
  const data = await handleResponse<{ success: boolean; accessToken: string; refreshToken?: string; account: RvbSafeUser }>(res);
  // Web ignores returned refreshToken (HttpOnly cookie is the source of truth)
  if (data.accessToken) setAccessToken(data.accessToken);
  return { accessToken: data.accessToken, account: data.account };
}

function getRefreshPromise(): Promise<{ accessToken: string; account: RvbSafeUser }> {
  if (!pendingRefresh) {
    pendingRefresh = doRefreshRequest().finally(() => {
      pendingRefresh = null;
    });
  }
  return pendingRefresh;
}

export const rvbAuthService = {
  getAccessToken,
  // Exposed for services that need Authorization header; no setter for refresh
  _setAccessToken: setAccessToken,

  subscribeAuthFailure(listener: AuthFailureListener): () => void {
    authFailureListeners.add(listener);
    return () => authFailureListeners.delete(listener);
  },

  async login(tag: string, password: string): Promise<{ accessToken: string; account: RvbSafeUser; mustChangePassword?: boolean }> {
    const res = await fetch(`${AUTH_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag, password }),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; accessToken: string; refreshToken?: string; account: RvbSafeUser; mustChangePassword?: boolean }>(res);
    if (data.accessToken) setAccessToken(data.accessToken);
    // Intentionally ignore data.refreshToken — HttpOnly cookie holds it for web
    // Set non-sensitive hint that a session may exist (for silent refresh gating, not token content)
    setSessionHint();
    return { accessToken: data.accessToken, account: data.account, mustChangePassword: data.mustChangePassword };
  },

  async refresh(): Promise<{ accessToken: string; account: RvbSafeUser }> {
    // Gated refresh: do not attempt if no hint that a session may exist (prevents pointless 401 loop)
    // Hint is non-sensitive local marker, not HttpOnly cookie content.
    if (!getAccessToken() && !hasSessionHint()) {
      throw Object.assign(new Error("RVB_NO_SESSION_HINT"), { code: "RVB_NO_SESSION_HINT", status: 401 });
    }
    const result = await getRefreshPromise();
    // Refresh succeeded → ensure hint persists
    setSessionHint();
    return result;
  },

  // Direct refresh without dedup (used by context init with same dedup)
  async refreshSession(): Promise<{ accessToken: string; account: RvbSafeUser }> {
    if (!getAccessToken() && !hasSessionHint()) {
      throw Object.assign(new Error("RVB_NO_SESSION_HINT"), { code: "RVB_NO_SESSION_HINT", status: 401 });
    }
    const result = await getRefreshPromise();
    setSessionHint();
    return result;
  },

  // PBS-BUG-029: explicit cookie-probe restore for RVB-surface bootstrap only.
  // Same shared refresh promise as refresh(); differs ONLY by skipping the
  // no-hint pre-network refusal. The hint stays an optimization (not proof of
  // session absence): a valid HttpOnly cookie must be recoverable when entering
  // RVB even if the hint disappeared. Default refresh() keeps the quiet gate
  // for callers that must not probe (global HSH mounts). Success re-sets the
  // hint through the existing path.
  async restoreSessionFromCookie(): Promise<{ accessToken: string; account: RvbSafeUser }> {
    const result = await getRefreshPromise();
    setSessionHint();
    return result;
  },

  async logout(): Promise<void> {
    const accessToken = getAccessToken();
    try {
      await fetch(`${AUTH_BASE}/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        // No refreshToken in body — cookie only; mobile would send body, web doesn't
        body: JSON.stringify({}),
        credentials: "include",
      });
    } catch {}
    clearAccessToken();
    clearSessionHint();
    pendingRefresh = null;
  },

  async me(): Promise<RvbSafeUser> {
    const token = getAccessToken();
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/me`, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
      cache: "no-store",
    });
    const data = await handleResponse<{ success: boolean; account: RvbSafeUser }>(res);
    return data.account;
  },

  async changePassword(payload: { currentPassword: string; newPassword: string; confirmPassword: string }): Promise<{ accessToken?: string; account: RvbSafeUser }> {
    const token = getAccessToken();
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; accessToken?: string; refreshToken?: string; account: RvbSafeUser }>(res);
    if (data.accessToken) setAccessToken(data.accessToken);
    // Ignore refreshToken for web (native handled via session metadata)
    return { accessToken: data.accessToken, account: data.account };
  },

  async onboarding(profilePicture: string): Promise<RvbSafeUser> {
    const token = getAccessToken();
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/onboarding`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ profilePicture }),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; account: RvbSafeUser }>(res);
    return data.account;
  },

  async updateProfile(payload: { displayName?: string; profilePicture?: string | null }): Promise<RvbSafeUser> {
    const token = getAccessToken();
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; account: RvbSafeUser }>(res);
    return data.account;
  },

  async getPreferences(): Promise<{ notifications: Record<string, boolean>; ui?: { language?: string; theme?: string } }> {
    const token = getAccessToken();
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/preferences`, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
      cache: "no-store",
    });
    const data = await handleResponse<{ success: boolean; preferences: any }>(res);
    return data.preferences;
  },

  async updatePreferences(prefs: Record<string, boolean> | { notifications?: Record<string, boolean>; ui?: { language?: string; theme?: string } }): Promise<any> {
    const token = getAccessToken();
    // Backward compat: if plain notifications map passed without wrapper keys
    let body: any;
    if (prefs && typeof prefs === "object" && ("notifications" in (prefs as any) || "ui" in (prefs as any))) {
      body = prefs;
    } else {
      body = { notifications: prefs };
    }
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/preferences`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; preferences: any }>(res);
    return data.preferences;
  },

  async getSessions(): Promise<{ sessions: any[]; currentSessionId: string }> {
    const token = getAccessToken();
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/sessions`, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
      cache: "no-store",
    });
    const data = await handleResponse<{ success: boolean; sessions: any[]; currentSessionId: string }>(res);
    return data;
  },

  async revokeOtherSessions(): Promise<void> {
    const token = getAccessToken();
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/sessions/revoke-others`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    });
    await handleResponse(res);
  },

  async authFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    const token = getAccessToken();
    const headers: any = { ...(init?.headers as any) };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(input, { ...init, headers, credentials: "include" as any });
    if (res.status !== 401) return res;
    // One retry with single shared refresh
    try {
      const refreshed = await getRefreshPromise();
      const retryHeaders: any = { ...(init?.headers as any), Authorization: `Bearer ${refreshed.accessToken}` };
      return fetch(input, { ...init, headers: retryHeaders, credentials: "include" as any });
    } catch (e) {
      // PBS-BUG-030: the just-used access token was rejected with 401, so drop
      // the cached copy. But only terminal refresh failures (server positively
      // proved the session is dead) may destroy durable session state via
      // notifyAuthFailure. Transient failures surface as the original 401 so
      // the caller fails without logging the user out.
      clearAccessToken();
      if (isTerminalRvbAuthError(e)) {
        notifyAuthFailure();
      }
      return res;
    }
  },

  clearLocal() {
    clearAccessToken();
    clearSessionHint();
    pendingRefresh = null;
  },

  hasSessionHint() {
    return hasSessionHint();
  },

  _notifyAuthFailureForTest() {
    notifyAuthFailure();
  },
};
```

## 49. COMPLETE DIFF — file 2

D. Literal unified diff (`git diff HEAD -- <file 2>`, second hunk block of sec 51):

<!-- BLOCK:DIFF-SVC -->
```diff
diff --git a/H.S.H-V2.0.0/frontend/src/services/rvb-auth.service.ts b/H.S.H-V2.0.0/frontend/src/services/rvb-auth.service.ts
index c62d761..7e3e0c3 100644
--- a/H.S.H-V2.0.0/frontend/src/services/rvb-auth.service.ts
+++ b/H.S.H-V2.0.0/frontend/src/services/rvb-auth.service.ts
@@ -31,6 +31,44 @@ function clearSessionHint(): void {
   } catch {}
 }
 
+// PBS-BUG-030: source-authoritative terminal-vs-transient classifier.
+// Local authentication/session state (hint + known user) may be destroyed
+// automatically ONLY on positive server evidence that the current session can
+// no longer be used. A temporary inability to verify the session (network
+// failure, timeout, 5xx, rate limit, unrecognized error) MUST NOT destroy it.
+//
+// Terminal set derived from CURRENT backend contracts (routes/rvb-auth.ts +
+// middleware/rvb-auth.ts, proven by PBS-BUG-030 runtime matrix):
+//   POST /api/rvb/auth/refresh -> 401 RVB_REFRESH_REQUIRED (no cookie)
+//                              401 RVB_TOKEN_INVALID (malformed / revoked /
+//                                  unknown / disabled / archived / deleted)
+//                              401 RVB_TOKEN_EXPIRED (expired DB session)
+//   requireRvbAuth (/me, ...)  -> 401 RVB_TOKEN_INVALID (bad access token)
+//                              401 RVB_SESSION_REVOKED (revoked/expired session)
+//                              401 RVB_UNAUTHENTICATED (no token / no account)
+//                              403 RVB_ACCOUNT_ARCHIVED / RVB_ACCOUNT_DISABLED
+//                              404 RVB_ACCOUNT_NOT_FOUND (defensive: the /me
+//                                  handler emits it; middleware 401 fires first)
+// Deliberately NOT terminal: 5xx, network errors, 429 RVB_RATE_LIMIT,
+// 403 RVB_FORBIDDEN (role authorization — session itself is still valid),
+// RVB_NO_SESSION_HINT (client-side gate, not server evidence), and any
+// unrecognized code (UNKNOWN defaults to preservation).
+const TERMINAL_RVB_AUTH_CODES = new Set([
+  "RVB_TOKEN_INVALID",
+  "RVB_TOKEN_EXPIRED",
+  "RVB_SESSION_REVOKED",
+  "RVB_REFRESH_REQUIRED",
+  "RVB_UNAUTHENTICATED",
+  "RVB_ACCOUNT_ARCHIVED",
+  "RVB_ACCOUNT_DISABLED",
+  "RVB_ACCOUNT_NOT_FOUND",
+]);
+
+export function isTerminalRvbAuthError(error: unknown): boolean {
+  const code = (error as { code?: unknown } | null | undefined)?.code;
+  return typeof code === "string" && TERMINAL_RVB_AUTH_CODES.has(code);
+}
+
 // Small subscription to allow authFetch to notify context when refresh fails
 type AuthFailureListener = () => void;
 const authFailureListeners = new Set<AuthFailureListener>();
@@ -294,9 +332,16 @@ export const rvbAuthService = {
       const refreshed = await getRefreshPromise();
       const retryHeaders: any = { ...(init?.headers as any), Authorization: `Bearer ${refreshed.accessToken}` };
       return fetch(input, { ...init, headers: retryHeaders, credentials: "include" as any });
-    } catch {
+    } catch (e) {
+      // PBS-BUG-030: the just-used access token was rejected with 401, so drop
+      // the cached copy. But only terminal refresh failures (server positively
+      // proved the session is dead) may destroy durable session state via
+      // notifyAuthFailure. Transient failures surface as the original 401 so
+      // the caller fails without logging the user out.
       clearAccessToken();
-      notifyAuthFailure();
+      if (isTerminalRvbAuthError(e)) {
+        notifyAuthFailure();
+      }
       return res;
     }
   },
```

(No third production file changed; sync/manager.ts intentionally untouched per sec 13/42.)

## 50. Complete before/after/diff for any third file if required

Not required — only the two files above changed in production. Sync manager,
backend, mobile, and chat-socket are byte-identical to HEAD (verified:
`git hash-object` == `git rev-parse HEAD:` for `sync/manager.ts`; `git diff
HEAD --name-only` lists only the two files plus the deleted 029 audit).

## 51. Machine byte-verification of all audit code blocks

Method (LF-normalized byte comparison; repo files are LF):
`BEFORE-*` blocks vs `git cat-file -p HEAD:<path>` bytes; `AFTER-*` blocks vs
working-tree bytes; `DIFF-*` blocks vs `git diff HEAD -- <paths>` bytes.
Block markers `<!-- BLOCK:NAME -->` delimit the fenced regions. Script
(`node`, no shell-redirection conversion):

```js
const {execSync}=require('child_process'),fs=require('fs'),crypto=require('crypto');
const root='C:/Users/islam/OneDrive/Desktop/poultry-business-suite';
const audit=fs.readFileSync(root+'/TEMP-PBS-BUG-030-AUDIT.md','utf8');
const block=n=>{const m=audit.match(new RegExp('<!-- BLOCK:'+n+' -->\\r?\\n```\\w*\\r?\\n([\\s\\S]*?)\\r?\\n```'));if(!m)throw new Error('missing '+n);return m[1].replace(/\r\n/g,'\n');};
const sha=s=>crypto.createHash('sha256').update(s,'utf8').digest('hex');
const blob=p=>execSync('git cat-file -p HEAD:'+p,{cwd:root}).toString('utf8').replace(/\r\n/g,'\n');
const P1='H.S.H-V2.0.0/frontend/src/contexts/RvbAuthContext.tsx',P2='H.S.H-V2.0.0/frontend/src/services/rvb-auth.service.ts';
const diff=execSync('git diff HEAD -- '+P1+' '+P2,{cwd:root}).toString('utf8').replace(/\r\n/g,'\n');
const rows=[
 ['BEFORE-CTX',block('BEFORE-CTX')+'\n',blob(P1)],
 ['AFTER-CTX',block('AFTER-CTX')+'\n',fs.readFileSync(root+'/'+P1,'utf8')],
 ['DIFF-CTX',block('DIFF-CTX')+'\n',diff.split('diff --git a/H.S.H-V2.0.0/frontend/src/services')[0]],
 ['BEFORE-SVC',block('BEFORE-SVC')+'\n',blob(P2)],
 ['AFTER-SVC',block('AFTER-SVC')+'\n',fs.readFileSync(root+'/'+P2,'utf8')],
 ['DIFF-SVC',block('DIFF-SVC')+'\n','diff --git a/H.S.H-V2.0.0/frontend/src/services'+diff.split('diff --git a/H.S.H-V2.0.0/frontend/src/services')[1]],
];
for(const[n,a,b]of rows)console.log(n,sha(a)===sha(b)?'MATCH':'MISMATCH',sha(a),sha(b));
```

Result (executed after writing this file; all six MUST read MATCH):

```text
BEFORE-CTX MATCH
AFTER-CTX MATCH
DIFF-CTX MATCH
BEFORE-SVC MATCH
AFTER-SVC MATCH
DIFF-SVC MATCH
```

(`git hash-object` of worktree files: ctx `e1e8155…`, svc `7e3e0c3…` — equal
to the `index` hashes in the diff header, confirming AFTER blocks = final
files and BEFORE blocks = parent-blob bytes. Comparison is LF-normalized on
both sides; the authoritative git object ids are the `cd7ac08`/`c62d761`/
`e1e8155`/`7e3e0c3` values also printed in the diff `index` lines.)

## 52. Verification commands

- `npx tsx tmp-pbs030-harness.ts` (backend matrix, sec 8/16/22-25) — 17 cases,
  all as tabled. Harness deleted after collection.
- `npx tsx tmp-pbs030-web-harness.ts` (pre-fix run: sec 17-19/26/28/30/32;
  post-fix run: sec 53-55/58/60/62-65). Harness deleted after collection.
- `npx tsx tmp-pbs030-supplement.ts` (G1 19/19, G2, G3, G4, G5). Deleted after.
- `npx tsc --noEmit` (frontend) — exit 0.
- `npx eslint src/contexts/RvbAuthContext.tsx src/services/rvb-auth.service.ts`
  — 17 problems (16 errors, 1 warning), IDENTICAL to HEAD baseline (16+1);
  delta zero, no unrelated debt touched.
- `npm run build` (frontend) — exit 0, all routes emitted.
- `npm run test:hsh-sync` (backend) — 34 passed, 0 failed.
- `git diff HEAD --check` — exit 0, no whitespace errors.

## 53. HSH one-shot 500 post-fix

`[pbs030] F-B-refresh-500 err-status=500 code=INTERNAL_ERROR ctx=preserved hint=1 user=null refreshHits=1`
Hint preserved; server cookie/session untouched; no terminal cleanup.

## 54. HSH network failure post-fix

`[pbs030] F-C-network err-status=(none) code=fetch failed ctx=preserved hint=1`
Codeless network error preserves durable state.

## 55. HSH recovery proof

`[pbs030] F-B-second-reload recovered user=pbs030web hint=1 refreshHits=[{"status":200}]`
Healthy backend + same HSH reload: gated refresh attempted (hint present),
200, access token + user restored, hint 1. Session NOT stranded — primary
closure test passes.

## 56. No sync/auth storm proof

G5: `bootstrap=200 changes=200 postEmpty=200` with NO credentials — server
sync never 401s; hint-gated sync resumes normal traffic only. F-G quiet:
`refreshHits=0`. Post-fix F-runs show exactly 1 refresh per scenario, no
loops (no retry scheduler added; `getRefreshPromise` dedupe untouched).

## 57. RVB transient post-fix

By construction + 029: transient probe failure now preserves hint AND user;
029 pathname re-probe still available as before. No redirect/refresh loop
possible (loadMe performs at most one probe per pathname; catch performs no
navigation; `setLoading(false)` settles). G2 proves probe path intact.

## 58. Terminal invalid-session proof

`[pbs030] F-F-terminal http=401 notified=1 hint=(absent) user=null`
Revoked session mid-`authFetch`: notification fires, durable state cleared,
fail-closed. Terminal bootstrap path uses the same classifier (G1 true-rows).

## 59. Disabled/archive proof

Backend matrix rows (sec 8/24/25) map to terminal codes; G1 matrix asserts
`RVB_ACCOUNT_DISABLED/403 -> true`, `RVB_ACCOUNT_ARCHIVED/403 -> true`,
refresh-side `RVB_TOKEN_INVALID/401 -> true`. Cleanup preserved by code path
identity with F-F (same `clearLocal` + notify wiring).

## 60. AuthFetch transient proof

`[pbs030] F-D-authFetch-500 http=401 notified=0 hint=1 user=set token=null`
Transient refresh 500: NO notification, hint + known user preserved, rejected
cached token dropped, original 401 surfaced to the caller. No loop.

## 61. AuthFetch terminal proof

Sec 58 (F-F). Additionally G4 post-logout probe terminal
(`RVB_REFRESH_REQUIRED`, hint stays absent).

## 62. 028 normal recovery proof

`[pbs030] F-E-028 http=200 ok=true refreshHits=1 notified=0 hint=1 user=set`
401 -> exactly 1 shared refresh -> retry 200. Unchanged.

## 63. 028 concurrency proof

`[pbs030] G3-concurrency refreshCount=1 results=[{"status":200,"ok":true},...x3]`
3 concurrent expired-token calls share ONE refresh; all retries succeed.

## 64. 029 cookie-only restore proof

`[pbs030] G2-restore ok user=pbs030sup hint=1` — unchanged post-fix.

## 65. HSH quiet-state proof

`[pbs030] F-G-quiet err-code=RVB_NO_SESSION_HINT refreshHits=0` — fresh
no-session bootstrap attempts zero network; local HSH operation unaffected
(sync gate unchanged, sync suite green).

## 66. Explicit logout proof

`[pbs030] G4-logout hint=(absent) token=(null) cookieInJar=false` +
`G4-post-logout-restore code=RVB_REFRESH_REQUIRED status=401`. Unconditional
cleanup intact; classifier cannot accidentally preserve (not consulted).

## 67. Error-classifier matrix

G1 19/19 PASS (listed in sec 52 run): 8 terminal-true rows (sec 9 set), 11
false rows (500/503/unknown-500/unknown-401/429/`RVB_FORBIDDEN`/
`RVB_NO_SESSION_HINT`/TypeError/bare-401/null/undefined).

## 68. TypeScript

`npx tsc --noEmit` in `H.S.H-V2.0.0/frontend`: `TSC_LASTEXIT=0`.

## 69. Lint

Touched-file ESLint: post-fix 17 problems (16 errors, 1 warning) == HEAD
baseline 17 problems (16 errors, 1 warning). All pre-existing (`any` legacy,
`set-state-in-effect` on the untouched `useEffect(loadMe)` line,
`exhaustive-deps` warning). Delta introduced by this cycle: zero.

## 70. Production build

`npm run build` in `H.S.H-V2.0.0/frontend`: `BUILD_LASTEXIT=0`, all routes
emitted (incl. `/rvb`, `/rvb/login`, HSH pages).

## 71. HSH sync suite

`npm run test:hsh-sync` in `H.S.H-V2.0.0/backend`:
`=== H.S.H sync integrity: 34 passed, 0 failed ===`.

## 72. 022–029 regression proof

028: sec 62/63. 029: sec 64. 022–026 (sync): sec 71 (34/0) + G5 no-auth sync
semantics unchanged. 027 no-change state: diff touches only the two 030
files — nothing else modified. No backend behavior changed (no backend diff).

## 73. 035 boundary proof

`git diff HEAD --name-only` lists ONLY the two 030 frontend files plus the
deleted disposable 029 audit. `chat-socket.service.ts` (frontend or backend
`lib/chat-socket`) does not appear; it is untouched.

## 74. git diff/status/check proof

Post-harness-removal state:
`git status --short`:
```text
M H.S.H-V2.0.0/frontend/src/contexts/RvbAuthContext.tsx
M H.S.H-V2.0.0/frontend/src/services/rvb-auth.service.ts
D TEMP-PBS-BUG-029-AUDIT.md
```
(plus untracked `TEMP-PBS-BUG-030-AUDIT.md`, this file).
`git diff HEAD --stat`:
```text
.../frontend/src/contexts/RvbAuthContext.tsx       |  18 +-
.../frontend/src/services/rvb-auth.service.ts      |  49 +-
TEMP-PBS-BUG-029-AUDIT.md                          | 503 ---------------------
3 files changed, 61 insertions(+), 509 deletions(-)
```
`git diff HEAD --check`: exit 0 (no output). `git diff HEAD --name-only`:
the two files + deleted 029 audit.

## 75. Remaining uncertainty

1. No full Chromium/Next.js E2E (see sec 15 rationale): guard-redirect timing
   on RVB one-shot 500 (sec 20) is architecture-derived, not browser-measured.
   The durable-state decisions (the actual 030 defect) are proven at the real
   service + real backend layer, which is where the bug and fix both live.
2. Persistent-outage auto-recovery on RVB without user navigation is claimed
   absent by code inspection (no timers), not by timed browser observation.
3. `/me` 404 `RVB_ACCOUNT_NOT_FOUND` classified terminal defensively though
   currently unreachable behind middleware (sec 8 note) — future-proof, harmless.
4. A future NEW terminal server code defaults to preservation until added to
   the set (fail-safe direction per A5; surfaced for re-audit, not silent logout).

## 76. Final status

FIXED — READY FOR GIORNO REVIEW
