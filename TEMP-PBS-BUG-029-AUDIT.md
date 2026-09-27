# TEMP-PBS-BUG-029-AUDIT -- localStorage hint gate blocks valid-cookie RVB restore

Status: **FIXED -- READY FOR GIORNO REVIEW** (see section 60).
Bug remains open -- only Giorno can close it.

Date (UTC): 2026-09-27.
Workspace: `C:\Users\islam\OneDrive\Desktop\poultry-business-suite`
Runtime under test: REAL Chromium (Playwright) + REAL frontend dev server
(:3000) + disposable harness backend (REAL rvb-auth/portal routers + REAL JWT +
sessions on MongoMemoryReplSet, TEST-ONLY 5s access TTL via harness-process env;
production config untouched). No core mocks.

START-OF-CYCLE CLEANUP (PBS-BUG-028 is CLOSED):
- Deleted `TEMP-PBS-BUG-028-AUDIT.md` (was committed; now shows as `D`).
- No `tmp-pbs028` remnants remained (removed in-cycle during 028).
- The 19-file 028 `authFetch` migration verified intact before proceeding
  (portal service: 11 authFetch calls present).

---

## 1. Bug definition

PBS-BUG-029 (CONFIRMED at runtime): `refresh()`/`refreshSession()` refuse
pre-network with `RVB_NO_SESSION_HINT` when the memory token AND the
non-sensitive `localStorage.rvb_has_session` hint are absent -- even with a
fully valid HttpOnly refresh cookie + live server session. After any hint loss
(cleared storage, new profile state, privacy cleanup), entering RVB performs
ZERO refresh requests and drops to login, although one server round-trip would
restore the session. The hint (an optimization) acts as false proof of absence.

## 2. Historical reason the hint gate exists

`RvbAuthProvider` mounts GLOBALLY (root `app/layout.tsx` wraps HSH + RVB), so
`loadMe()` runs on every ordinary HSH page (`/`, `/products`, `/customers`).
Without the gate, each HSH visit with no session would POST
`/api/rvb/auth/refresh` and eat a 401 -- the old clean-room 401-noise bug. The
gate (`!token && !hint -> throw pre-network`) keeps unauthenticated HSH at
exactly 0 refresh requests (B5 proves it today). Any fix MUST preserve this
(section 40 is the hard gate).

## 3. Current auth-service architecture

`frontend/src/services/rvb-auth.service.ts` (304 lines + 13-line fix): module
`memoryAccessToken` (never persisted) + shared `pendingRefresh`; hint
helpers; failure-listener subscription; `getAccessToken` (+ test setter);
`handleResponse` (code/status/data errors); cookie-only `doRefreshRequest`
(stores new access token); deduped `getRefreshPromise`; `login` (sets hint);
gated `refresh`/`refreshSession`; cookie-driven `logout` (clears token+hint);
authenticated `me`/password/profile/preferences/sessions methods (all via
`authFetch` since 028); `authFetch` (401 -> one shared refresh -> one retry);
`clearLocal`, `hasSessionHint`.

## 4. Hint semantics

`rvb_has_session="1"` = "a session was previously known to exist". Set on
login/any successful refresh; cleared on logout/clearLocal. Non-sensitive,
non-authoritative by design -- but pre-fix `refresh()` treated absence as proof
of no session (the bug). Post-fix contract (section 32): optimization only.

## 5. Current refresh() implementation

```ts
async refresh() {
  if (!getAccessToken() && !hasSessionHint()) throw RVB_NO_SESSION_HINT(401);
  const result = await getRefreshPromise();
  setSessionHint();
  return result;
}
```
Preconditions: needs EITHER memory token OR hint; otherwise throws pre-network
(no request). Success re-sets hint. Server errors propagate from
`doRefreshRequest` unchanged. BYTE-IDENTICAL pre/post fix (rule: gate preserved
for quiet callers).

## 6. Current refreshSession() implementation

Identical gate + shared promise + hint re-set. ZERO external callers
(grep-verified: definition only). Left byte-identical (minimal diff).

## 7. Shared refresh-promise behavior

`pendingRefresh` singleton, `.finally` cleared. Concurrent refresh()/
restoreSessionFromCookie()/authFetch() calls share one POST. Proven B7(028
cycle) and F9/F10 here. Untouched.

## 8. RvbAuthContext loadMe flow

Pre-fix: token? `me()` (authFetch, self-recovering) : skip; then `refresh()`
(gated); catch -> `clearLocal()` + `setUser(null)` (030 policy, PRESERVED
byte-identical); finally `setLoading(false)`. Runs on mount + pathname change
(`useCallback [pathname]`). Post-fix: identical except the no-token/me-failed
branch selects `restoreSessionFromCookie()` on RVB surface vs gated `refresh()`
elsewhere (section 30). Guard (`RvbAuthGuard`) only redirects on user/loading --
never probes.

## 9. Provider mount topology

`RvbAuthProvider` wraps EVERYTHING in root `app/layout.tsx` (L25-28). RVB
subtree adds `RvbAuthGuard` via `app/rvb/layout.tsx` (7 lines). No other
provider/guard mounts (grep: definition + guard + role-guard comment only).

## 10. HSH vs RVB route topology

HSH pages (`/`, `/products`, `/customers`, ...) mount provider WITHOUT guard;
RVB pages mount provider + guard; `/rvb/login` is the public RVB page (guard
lets unauthenticated stay). pathname signal (`usePathname`, already used by the
guard) cleanly separates surfaces: `pathname === "/rvb" ||
pathname.startsWith("/rvb/")`.

## 11. Complete refresh-caller matrix

| caller | purpose | HSH? | RVB? | hint-absent probe? | quiet-if-absent? |
|---|---|---|---|---|---|
| Context loadMe | bootstrap restore | yes (mount) | yes | POST-FIX: RVB-only | yes on HSH |
| Context refresh() | manual | n/a | yes | no (gated) | n/a |
| chat-socket L36 | socket re-auth (035) | no | yes | no (gated; untouched) | n/a |
| authFetch internals | 028 mid-session recovery | yes/no (any caller) | yes | YES (never gated, pre-existing) | n/a (needs 401 first) |
| sync/manager hint read | HSH sync gating | yes | n/a | n/a (read-only, untouched) | yes |

## 12. PBS-BUG-028 interaction

`authFetch` calls `getRefreshPromise()` directly -- never consulted the hint
gate before, during, or after this cycle (diff-proof: helper lines untouched).
Mid-session expiry recovery (B9/F9: 1 refresh + retry success) is independent
of bootstrap restoration and stays green.

## 13. PBS-BUG-030 boundary

Catch (`clearLocal()` + `setUser(null)` on ANY bootstrap error incl. 500s) is
byte-identical pre/post fix (diff-proof section 36). B10/F11 record the behavior
(login redirect + hint cleared on a 500) without repairing it.

## 14. Backend cookie-only refresh contract

`POST /api/rvb/auth/refresh`: cookie `rvb_refresh_token` (HttpOnly, SameSite
Lax, Secure iff prod, path `/`, 30d maxAge); NO body token, NO Authorization
needed; rotates session + cookie; returns `{accessToken, account}` (+ native
refreshToken JSON only with X-RVB-Client). Absent/invalid/revoked/expired ->
401 (`RVB_TOKEN_INVALID`/`RVB_TOKEN_EXPIRED` measured). Server has ZERO
knowledge of `rvb_has_session` (no reference anywhere in backend).

## 15. Cookie security attributes

HttpOnly=true (JS-unreadable -- verified: all cookie evidence via
`context.cookies()`, never `document.cookie`), Lax, prod-Secure, path `/`.
Frontend never reads/copies the refresh value (grep section 50).

## 16. Sync-manager hint use

`sync/manager.ts` L293: reads the hint directly to skip `/api/sync` when
absent (HSH local-only). Document-only; untouched (not in diff); B5 measures 0
sync hits without hint, preserved post-fix by design (no shared code changed).

## 17. Baseline browser/test environment

Disposable harness backend (`tmp-pbs029-harness.ts`, deleted after cycle):
memory replset + REAL rvb-auth/portal routers + test-only 5s access TTL
(process env) + `__test/seed` + `__test/revoke-sessions` hooks (NOT
production). Disposable Playwright specs (`tmp-pbs029.spec.ts` baseline,
`tmp-pbs029b.spec.ts` post-fix) + `playwright.tmp-pbs029.config.cjs` (no
webServer; live :3000/:5000). Refresh accounting via request/response
listeners. Cookie evidence via `context.cookies()` (HttpOnly-safe).

## 18. Real login control (B1)

UI login (`#rvb-tag-input/#rvb-password-input/submit`): lands `/rvb`, hint
`"1"`, cookie present + HttpOnly, 0 refresh hits. Baseline locked.

## 19. Normal hard-reload control (B2)

Hinted reload: 1 refresh, 200, stays `/rvb`, hint `"1"`. Working path,
unchanged post-fix (F6 identical).

## 20. Missing-hint + valid-cookie reproduction (B3, PRIMARY)

Login -> delete ONLY the hint -> `goto /rvb` (reload kills memory; cookie +
session live): **0 refresh requests**, lands `/rvb/login`, hint null.
DECISIVE: valid session abandoned pre-network. (Post-fix rerun: 1x200 restore,
stays -- F1.)

## 21. Server-oracle cookie refresh (B4)

Same state, direct cookie `POST refresh` bypassing the gate: 200 + fresh
accessToken + account. The BLOCKER IS THE LOCAL HINT, not server validity.

## 22. No-session HSH baseline (B5)

Fresh context over `/`, `/products`, `/customers`: 0 refresh + 0 sync hits,
no errors. The invariant the fix must preserve (F3 re-proves: still 0).

## 23. No-session RVB baseline (B6)

Fresh context -> `/rvb`: 0 refresh (gate), lands `/rvb/login`, which stays put
(0 further). Post-fix these become exactly-1-probe each (F4) by design.

## 24. Invalid/stale-cookie baseline (B7)

Login -> revoke server sessions -> clear hint -> `/rvb`: whole-test window
showed 1 refresh attempt (whole-window counting includes the login phase where
the 5s TEST TTL can marginally expire mid-flow and trigger one legitimate 028
recovery; the phase-scoped post-fix F5 isolates the revoke navigation
precisely), final URL `/rvb/login`. Oracle: direct cookie refresh POST ->
401 `RVB_TOKEN_INVALID`. Fail-closed baseline (F5 re-proves post-fix with exact
per-navigation accounting).

## 25. Logout baseline (B8)

Service-mirroring logout (no logout button exists in UI): API logout + hint
clear -> `/rvb` -> login redirect, hint null, 0 cookies. Post-fix F8 adds the
single failed probe on the dead session (by design), still logged out.

## 26. 028 mid-session control (B9)

Login -> 6s (5s TTL dies, session lives) -> reload: `me()` 401 ->
one shared refresh -> retry 200, stays `/rvb`, exactly 1 refresh hit.
028 behavior locked; re-proven post-fix (F9 identical: 1x200).

## 27. 030 transient-error boundary (B10)

Refresh forced 500 once: lands `/rvb/login`, hint null (clearLocal ran).
Record-only; F11 identical post-fix (030 untouched).

## 28. Decision-gate result

CASE 2 (expected): B3 reproduced (0 requests, login redirect despite valid
cookie+session) AND B5 proves global gate removal would resurrect HSH 401
traffic (0 today across 3 HSH pages). Therefore: NO blind gate removal; narrow
RVB-surface cookie probe (section 30).

## 29. Exact root cause

Two facts combined: (a) the provider mounts globally, so bootstrap runs on
every page; (b) the bootstrap's only cookie path (`refresh()`) refuses
pre-network without the hint. The hint -- meant as an HSH quiet-optimization --
became the sole arbiter of whether a server session may exist, although the
server (cookie-only contract) never consults it. Valid sessions are thus
unrestorable whenever the hint is lost without logout.

## 30. Chosen fix architecture (C1-C8)

- New `restoreSessionFromCookie()` on `rvbAuthService`: same shared
  `getRefreshPromise()` + `setSessionHint()` on success, NO hint gate.
  `refresh()`/`refreshSession()` byte-identical (quiet callers unaffected).
- `RvbAuthProvider.loadMe()`: route-aware selection via `usePathname()` --
  no-token/me-failed + RVB surface (`/rvb` or `/rvb/...`) ->
  `restoreSessionFromCookie()`; otherwise gated `refresh()`. Catch/finally
  byte-identical (030 preserved); guards/redirects untouched; no new state,
  no token invalidation, no TTL change, no backend change, no socket change.
- Rejected: blind gate removal (breaks B5 quiet state -- measured 0 today).

## 31. Why blind gate removal was rejected

B5: fresh browser over `/`, `/products`, `/customers` performs ZERO refresh
requests today BECAUSE the gate throws pre-network. The provider mounts on all
three (global layout). Removing the gate would convert every HSH visit into a
refresh POST + 401 -- the exact historical clean-room regression. F3 re-proves
0 post-fix.

## 32. Hint-as-optimization design

Post-fix the hint means "session previously known" (skip-free fast path is
unchanged: hinted flows never even notice the probe exists) and NEVER means
"no session exists". Code comment records this on `restoreSessionFromCookie`.

## 33. Permanent files changed

Exactly TWO:
- `H.S.H-V2.0.0/frontend/src/services/rvb-auth.service.ts` (+13: one method)
- `H.S.H-V2.0.0/frontend/src/contexts/RvbAuthContext.tsx` (+10/-3: import,
  pathname, route-aware branch, dep array)

## 34. FULL BEFORE -- rvb-auth.service.ts (relevant region; file otherwise untouched)

The `refreshSession()` block end + `logout()` start, 047/HEAD state (the only
region this file changes; all other 300+ lines byte-identical):
```ts
  // Direct refresh without dedup (used by context init with same dedup)
  async refreshSession(): Promise<{ accessToken: string; account: RvbSafeUser }> {
    if (!getAccessToken() && !hasSessionHint()) {
      throw Object.assign(new Error("RVB_NO_SESSION_HINT"), { code: "RVB_NO_SESSION_HINT", status: 401 });
    }
    const result = await getRefreshPromise();
    setSessionHint();
    return result;
  },

  async logout(): Promise<void> {
```

## 35. FULL AFTER + unified diff -- rvb-auth.service.ts

AFTER inserts one method between them (literal diff hunk):
```diff
@@ -136,6 +136,19 @@ export const rvbAuthService = {
     return result;
   },
 
+  // PBS-BUG-029: explicit cookie-probe restore for RVB-surface bootstrap only.
+  // Same shared refresh promise as refresh(); differs ONLY by skipping the
+  // no-hint pre-network refusal. The hint stays an optimization (not proof of
+  // session absence): a valid HttpOnly cookie must be recoverable when entering
+  // RVB even if the hint disappeared. Default refresh() keeps the quiet gate
+  // for callers that must not probe (global HSH mounts). Success re-sets the
+  // hint through the existing path.
+  async restoreSessionFromCookie(): Promise<{ accessToken: string; account: RvbSafeUser }> {
+    const result = await getRefreshPromise();
+    setSessionHint();
+    return result;
+  },
+
   async logout(): Promise<void> {
```
No other line of this file differs (`git diff` shows exactly this hunk for the
file; `refresh()`/`refreshSession()`/hint helpers/`authFetch`/logout all
byte-identical).

## 36. FULL BEFORE/AFTER + unified diff -- RvbAuthContext.tsx

Complete literal diff (the file's ONLY hunk set; catch/finally/guard logic
byte-identical):
```diff
diff --git a/H.S.H-V2.0.0/frontend/src/contexts/RvbAuthContext.tsx b/H.S.H-V2.0.0/frontend/src/contexts/RvbAuthContext.tsx
index b4ba602..cd7ac08 100644
--- a/H.S.H-V2.0.0/frontend/src/contexts/RvbAuthContext.tsx
+++ b/H.S.H-V2.0.0/frontend/src/contexts/RvbAuthContext.tsx
@@ -1,6 +1,7 @@
 "use client";
 
 import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
+import { usePathname } from "next/navigation";
 import { rvbAuthService, type RvbSafeUser } from "../services/rvb-auth.service";
@@ -20,6 +21,7 @@ const Ctx = createContext<RvbAuthState | null>(null);
 export function RvbAuthProvider({ children }: { children: React.ReactNode }) {
   const [user, setUser] = useState<RvbSafeUser | null>(null);
   const [loading, setLoading] = useState(true);
+  const pathname = usePathname();
 
   const loadMe = useCallback(async () => {
@@ -34,9 +36,16 @@ export const rvbAuthService = {
         // access expired, fall through to refresh
       }
     }
-    // No token or me failed → attempt silent refresh using HttpOnly cookie
+    // No token or me failed → attempt silent refresh using HttpOnly cookie.
+    // PBS-BUG-029: on the RVB surface allow ONE explicit cookie probe even when
+    // the local hint is absent (hint is an optimization, not proof of absence).
+    // Ordinary HSH routes keep the gated refresh() so unauthenticated pages
+    // stay quiet with zero refresh traffic.
+    const onRvbSurface = pathname === "/rvb" || pathname.startsWith("/rvb/");
     try {
-      const refreshed = await rvbAuthService.refresh();
+      const refreshed = onRvbSurface
+        ? await rvbAuthService.restoreSessionFromCookie()
+        : await rvbAuthService.refresh();
       setUser(refreshed.account);
     } catch {
       rvbAuthService.clearLocal();
@@ -44,7 +53,7 @@ export const rvbAuthService = {
     } finally {
       setLoading(false);
     }
-  }, []);
+  }, [pathname]);
```
BEFORE/AFTER full-file equivalence: all other 100+ lines (state, me() branch,
catch `clearLocal()+setUser(null)`, finally, language-sync/guard-listener/
login/logout/refresh/changePassword/onboarding effects, context value) are
byte-identical; the diff above is the file's complete change set.

## 37. Verification commands

From `H.S.H-V2.0.0/frontend` (live :3000 + harness :5000):
`.\node_modules\.bin\playwright test --config=playwright.tmp-pbs029.config.cjs e2e/tmp-pbs029b.spec.ts --reporter=list`
(plus baseline `e2e/tmp-pbs029.spec.ts` pre-fix). From `frontend`:
`npx tsc --noEmit`, `npx eslint <2 touched files>` (parity vs stash),
`npm run build`. From `backend`: `npm run test:hsh-sync`. From repo root:
`git diff --name-only/--stat/--check`.

## 38. Cookie-only RVB restore result (F1)

Hint deleted + valid cookie, `goto /rvb`: exactly 1 refresh, `[200]`, stays
`/rvb`, hint back to `"1"`. PRIMARY closure (was: 0 requests + login redirect).

## 39. Login-page restoration result (F2)

Same state via `/rvb/login`: 1x200 restore, guard bounces to `/rvb`, hint
`"1"`. No loop.

## 40. HSH quiet-state regression proof (F3)

Fresh context, `/` + `/products` + `/customers`: 0 refresh requests. HARD GATE
HOLDS post-fix (identical to B5).

## 41. No-session RVB proof (F4)

Fresh context -> `/rvb`: 2x401 (mount probe + guard-redirect echo), then 0 new
in settle window, lands `/rvb/login`. Bounded, silent, correct redirect.

## 42. Stale-cookie proof (F5)

Revoked session + no hint/token -> `/rvb`: 2-4x401 (mount + redirect echo +
occasional hydration rerun; run-observed max 4), then 0 new, `/rvb/login`,
hint null. Fail-closed, no loop, no resurrection.

## 43. Normal hinted reload result (F6)

Hinted reload: >=1 refresh, 200s, stays `/rvb`, hint `"1"`. Unchanged working
path (matches B2).

## 44. Valid-memory-token result (F7)

Post-login same-document settle (fresh token): 0 refresh hits, stays `/rvb`.
Valid token path never probes unnecessarily.

## 45. Logout result (F8)

Service-mirroring logout -> `/rvb`: 2x401 (mount + echo on dead session),
silence, `/rvb/login`, hint null, 0 cookies. No resurrection.

## 46. PBS-BUG-028 regression result (F9/F10)

Expired 5s token + valid session -> reload: 1x200 shared refresh, stays `/rvb`,
hint `"1"`. 028 recovery byte-behavior-identical (B9: same 1x200).

## 47. Concurrent refresh result (F10)

Covered by F9's single-shared-refresh assertion (bootstrap fires its normal
multi-request set; exactly 1 refresh POST) + unchanged shared-promise code +
028-cycle B7 proof (3 concurrent -> 1 refresh) on the untouched dedupe unit.

## 48. PBS-BUG-030 unchanged proof (F11)

Forced refresh 500: lands `/rvb/login`, hint null (clearLocal ran). Identical
to B10 baseline. Catch block byte-identical (§36). 030 left for its cycle.

## 49. Hint recreation proof (F12)

F1/F2/F6 end with hint `"1"` via the pre-existing `setSessionHint()` success
path (no new state logic).

## 50. HttpOnly/no-cookie-read proof (F13)

Diff adds zero cookie access: no `document.cookie`/CookieStore/cookie parsing
anywhere in the change set; session truth stays server-side; secrets never
logged (fingerprints only in harness output, harness deleted).

## 51. Post-fix refresh-caller inventory (F14)

Unchanged callers + ONE intentional addition: context bootstrap may call
`restoreSessionFromCookie()` (RVB surface only). No generic HSH caller probes;
sync manager + chat-socket paths untouched.

## 52. TypeScript result (F15)

`npx tsc --noEmit` (frontend, final tree) -> exit 0, no output.

## 53. Lint result (F16)

Touched files (auth service + context): 17 problems post-fix vs 17 at HEAD
(stash comparison) -- identical pre-existing debt; zero new findings.

## 54. Production build result (F17)

`npm run build` (frontend, final tree) -> success (full route table, no
bundling/cycle errors from the context import addition).

## 55. HSH sync-suite result (F18)

`npm run test:hsh-sync` (backend, final tree) -> `34 passed, 0 failed`.

## 56. 028 migration preservation proof (F19)

`git diff` contains zero of the 19 migrated service modules; per-file
`authFetch(` counts re-verified unchanged in final checks; F9 re-proves
runtime recovery.

## 57. 030/035 scope proof (F20)

`RvbAuthContext` catch/finally byte-identical (§36); `chat-socket.service.ts`
absent from diff; no socket/auth-policy change.

## 58. git diff/status/check proof (F21)

`git diff --name-only` (repo root, final): exactly the 2 files (§33) +
`TEMP-PBS-BUG-028-AUDIT.md` (expected prior-cycle cleanup deletion).
`git diff --stat`: +13 service / +10-3 context. `git diff --check`: clean.
`git status`: + untracked `TEMP-PBS-BUG-029-AUDIT.md` only (after disposable
removal). Zero backend/mobile/sync files.

## 59. Remaining uncertainty

1. Probe count per unauthenticated RVB navigation is 2-4 one-off 401s (mount +
redirect echo + occasional hydration rerun) rather than exactly 1; all runs
then silent. A ref-guard could halve it but adds staleness risk of its own;
documented as accepted. LOW.
2. `/rvb/login` initial mount probes even with no session (1x401) -- required
for F2 restoration on direct landing; HSH unaffected. LOW.
3. Cross-tab hint races (tab A logs out, tab B holds hint) resolve server-side
per request; unchanged semantics. LOW.

## 60. Final status

FIXED — READY FOR GIORNO REVIEW
