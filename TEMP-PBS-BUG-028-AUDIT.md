# TEMP-PBS-BUG-028-AUDIT -- RVB web services bypass authFetch, no refresh on 401

Status: **FIXED -- READY FOR GIORNO REVIEW** (see section 57).
Bug remains open -- only Giorno can close it.

Date (UTC): 2026-09-27.
Workspace: `C:\Users\islam\OneDrive\Desktop\poultry-business-suite`
Runtime under test: REAL frontend service code (tsx-imported) + REAL backend
routers/JWT on MongoMemoryReplSet, with a cookie-jar + localStorage shim (Node
has neither) and a TEST-ONLY 3s access TTL via disposable-process env.
Production config untouched. Supertest-style direct fetch for observation;
no core mocks. Node v22.

START-OF-CYCLE CLEANUP (PBS-BUG-027 REJECTED -- NOT A BUG):
- Deleted `TEMP-PBS-BUG-027-AUDIT.md` (was committed; now shows as `D`).
- No `tmp-pbs027` remnants remained (removed in-cycle during 027).
- No 027 production files exist to revert. CLOSED 022-026 fixes intact
  (re-verified in final checks).

---

## 1. Bug definition

PBS-BUG-028 (CONFIRMED at runtime): RVB web defines `authFetch()` (401 ->
one deduped refresh -> one retry with the new token) but every authenticated
web service calls native `fetch()` with a snapshot `Authorization` header.
After access-token expiry, ordinary service calls fail 401 without attempting
refresh, even with a valid refresh session + cookie + hint. Measured baseline
(B3): `portal.me()` -> 401 `RVB_TOKEN_INVALID`, 0 refresh requests, token
unchanged. The helper itself works (B4: same state via `authFetch` -> 200,
1 refresh, token rotated) -- decision-gate CASE 2: wire the callers.

## 2. Current auth-service architecture

`frontend/src/services/rvb-auth.service.ts` (304 lines, read in full):
module-scope `memoryAccessToken` + `pendingRefresh`; localStorage hint helpers;
`authFailureListeners` subscription; `getAccessToken` (+ test setter
`_setAccessToken`); `handleResponse` (non-ok -> Error with code/status/data);
`doRefreshRequest` (cookie-only POST refresh, stores new access token);
`getRefreshPromise` (shared/deduped); object `rvbAuthService` with login,
refresh, refreshSession, logout, me, changePassword, onboarding, updateProfile,
getPreferences, updatePreferences, getSessions, revokeOtherSessions, authFetch,
clearLocal, hasSessionHint, test notifier.

## 3. Access-token storage

In-memory module variable ONLY (`memoryAccessToken`), never persisted
(comment-verified L10). `getAccessToken()` read by every service's
`getAuthHeaders()` at CALL time (snapshot semantics -- the staleness vector:
after expiry the snapshot is a dead Bearer). Set on login/refresh/change-
password; cleared on logout/clearLocal/refresh-failure.

## 4. Refresh-token/session architecture

Refresh token lives ONLY in the HttpOnly cookie (web); frontend never sees its
value (`data.refreshToken` deliberately ignored, L78/L111). Server rotates
session + cookie per refresh (rvb-auth.ts L284-314). Session З-set:
`RvbSessionModel {id/accountId/refreshTokenHash/createdAt/expiresAt/revokedAt}`.
Frontend keeps only a non-sensitive `rvb_has_session="1"` hint for gating.

## 5. Exact authFetch implementation

L273-289 verbatim logic: (1) `headers = {...init.headers}`; (2) if memory token,
`headers.Authorization = Bearer <current>` (caller value OVERWRITTEN -- safe
precedence); (3) `fetch(input, {...init, headers, credentials:"include"})`
(credentials FORCED include); (4) non-401 returned untouched; (5) on 401,
`await getRefreshPromise()` (shared dedupe, NO hint-gate consultation);
(6) retry headers rebuilt from `init.headers` + `Bearer <refreshed.accessToken>`
(NEW token, custom headers preserved); (7) single `fetch` returned directly (no
recursion => exactly one retry); (8) refresh throw -> `clearAccessToken()` +
`notifyAuthFailure()` + return ORIGINAL 401 response (no loop, no throw).

## 6. Header merge/precedence analysis

First attempt: caller headers spread first, then live memory token overwrites
`Authorization` -- a stale caller snapshot can NEVER survive (verified by
construction + F3 fingerprint proof). Retry: same merge against the REFRESHED
token. `credentials` forced `"include"` on both attempts (matches every migrated
caller, which already passes it). `cache` and all other init fields pass through
untouched on both attempts. Custom headers (Content-Type on POST/PATCH/DELETE)
preserved identically on retry (proven functionally: F9POST body parses).

## 7. Retry semantics

Exactly ONE retry, only on HTTP 401 (any body code -- keys off status, matching
the backend contract where expired/invalid/revoked all surface as 401).
No recursion (`return fetch(...)` directly). Retry reuses `input` + `init`
(method/body/headers/credentials/signal identical except Authorization). All
service bodies are JSON strings or undefined (section 31: no FormData/Blob/
streams anywhere in frontend/src) -- replay-safe. No AbortSignal usage in any
service (grep-verified) -- nothing to propagate specially.

## 8. Refresh dedupe analysis

`pendingRefresh` module singleton: first 401 creates the promise, concurrent
401s share it (`.finally` clears). B7 measured: 3 concurrent expired-token
`authFetch` calls -> all succeed, exactly 1 refresh POST. Dedupe correct; no
change needed before migration (B7 is the prerequisite proof).

## 9. PBS-BUG-029 boundary

`refresh()`/`refreshSession()` refuse when `!getAccessToken() &&
!hasSessionHint()` (L120/L131) -- the hint gate. `authFetch` calls
`getRefreshPromise()` DIRECTLY and never consults the gate (current design).
Harness KEEPS the hint present for all 028 tests (login sets it). 029 scenario
(cookie alive + hint missing) untouched and untested here except F15, which
proves the gate still refuses (`RVB_NO_SESSION_HINT`) post-fix. No gate code
modified.

## 10. PBS-BUG-030 boundary

`RvbAuthContext.tsx`: `clearLocal()` on init catch (L42) + `subscribeAuthFailure
-> clearLocal` (L64-65). Read-only in this cycle; zero bytes changed (F16
diff-proof). 028 reproduces purely at service layer (no context involved).

## 11. Complete frontend fetch inventory

`frontend/src` `fetch(` producers: the 18 migrated service modules (section 12);
`rvb-auth.service.ts` (login/refresh/logout/me+7 -- classified section 13);
`printing.service.ts` x5 (Content-Type only, NO auth headers -- unrelated D);
`services/sync/client.ts` x4 (HSH sync/bootstrap/status, NO Authorization --
unrelated D); e2e specs (test code, out of scope). No app-component direct
authenticated fetch (Authorization grep confined to services/). No Request/
FormData/Blob/ReadableStream/AbortController usage in services (grep-verified).

## 12. Authenticated-service inventory (all C-class, all migrated)

Calls per file (native fetch BEFORE -> authFetch AFTER, counts machine-verified
section 45): rvb-worker 9, rvb-supplier 7, rvb-customer 8, rvb-request 3,
rvb-portal 11, rvb-notification 7, rvb-directory 2, rvb-account 11,
rvb-activity 1, rvb-catalog 2, rvb-config 2, chat (HTTP) 16, customer-order 5,
customer-request 3, supplier-request 3, worker-request 3, worker-activity 1,
worker-financial-event 2 = 96 call sites. Every site already passed
`credentials:"include"`; GETs pass `cache:"no-store"`; mutating calls pass
`Content-Type: application/json` + `JSON.stringify` bodies; all verified
per-file before editing (fetch/authHdr/import counts).

## 13. Public/auth endpoint exclusions

Kept on native fetch, deliberately: `login` (no token yet), `doRefreshRequest`
(the refresh itself -- routing it through authFetch would recurse-refresh on
401), `logout` (cookie-driven server revocation; must work with a dead access
token and must never trigger refresh -- rule 16). `chat-socket.service.ts`
(websocket transport -- rule 17/035). printing/sync-client (no auth at all).

## 14. Mobile reference behavior

`R.V.B-mobile/src/api/client.ts` `rvbRequest`: 401 (and not skipRefresh/skipAuth)
-> one shared `getPendingRefresh()` -> on success retry ONCE with
`skipRefresh:true` (loop-proof by flag); on failure throw normalized error and,
for terminal codes (incl. RVB_TOKEN_EXPIRED), clear local session. Read-only
reference; zero mobile bytes changed. Web `authFetch` implements the same
contract (single retry, shared promise, no-loop) minus the JSON-error
normalization layer, which web services already own via `handleRes`.

## 15. Backend TTL/error contract

Access TTL default `15m` (`getAccessTTL`); test-only `3s` via disposable-process
env (production config untouched). Expired/invalid/revoked access uniformly
-> HTTP 401 (B3 measured `RVB_TOKEN_INVALID` on expiry). Refresh:
`POST /api/rvb/auth/refresh`, cookie-only for web, rotates session+cookie,
returns `{accessToken, account}`; revoked/expired session -> 401. `authFetch`
keys off HTTP 401 only -- correct under this contract.

## 16. Baseline test environment

Disposable `backend/tmp-pbs028-baseline.ts` (deleted after cycle): memory
replset; Express mounting REAL rvb-auth/portal/notifications/directory routers
+ harness-only always-401 route (B5/F7; NOT production); supertest-style counter
on `/api/rvb/auth/refresh`; cookie-jar + localStorage shims (Node lacks both);
`NEXT_PUBLIC_API_URL` pointed at the test server BEFORE frontend imports
(ts-service BASE constants resolve at import). Real `login` (bcrypt account),
real 3s TTL, real expiry sleeps. Token fingerprints only (`a1b2..c3d4`), never
secrets.

## 17. Valid-token control (B1)

Fresh login: `portal.me()` succeeds, `refreshHits:0`, hint present. Baseline
locked (also re-verified post-fix as F5).

## 18. Expired-token service reproduction (B2/B3)

After 3.5s sleep (3s TTL): hint present, session row valid. CURRENT
`portal.me()` -> threw 401 `RVB_TOKEN_INVALID`, `refreshDelta:0`, token
unchanged. DECISIVE baseline: valid refresh session + cookie + hint, zero
refresh attempted, service fails. (Post-fix rerun of the same call recovers --
B3 line in postfix mode: success, 1 refresh, token rotated.)

## 19. Direct-authFetch control (B4)

Same expired state, `authFetch(portal/me)` directly: 200, `refreshDelta:1`,
`tokRotated:true` (new fingerprint). Helper CORRECT as-is -- CASE 2 confirmed,
no helper fix needed before migration.

## 20. Retry-still-401 result (B5)

Harness-only always-401 route (auth passes, handler 401s): `authFetch` ->
status 401, exactly 1 refresh. No loop. Helper correct.

## 21. Refresh-failure result (B6)

Expired token + revoked session: `authFetch` -> 401, exactly 1 refresh attempt,
memory token cleared to null. No recursion, no throw (returns orig response).
Correct.

## 22. Concurrent-401 result (B7)

3 concurrent expired-token `authFetch` (portal/notifications/directory): all
fulfilled+ok, `refreshDelta:1`. Shared-promise dedupe correct.

## 23. Representative GET baseline (B8)

Post-B4 fresh token: notification `list({})` ok, directory `list({q:"W"})` ok,
`refreshDelta:0`. (Post-fix these same lines exercise migrated code -- F8.)

## 24. Representative mutation baseline (B8post)

`notification.markAllRead()` POST ok with fresh token. (Post-fix rerun after
expiry = F9POST recovery proof incl. Content-Type parity.)

## 25. Request-semantics baseline (B9)

Recorded contract every migrated call preserves: method, absolute URL,
JSON-string-or-undefined body, Content-Type+Authorization headers, credentials
include, cache no-store on GETs, handleRes error mapping. Post-fix parity
asserted by identical inits (single-token diff) + functional F-proofs.

## 26. Reproduced / not-reproduced decision

CASE 2 (expected): services fail (B3), `authFetch` works (B4-B7 all correct).
Proceed: wire callers; no helper redesign.

## 27. Root cause

Transport bypass, not token logic: 96 authenticated call sites snapshot the
Bearer via `getAuthHeaders()` into native `fetch`, so expiry fails each call
independently with no recovery path, while the correct recovery helper sat
uncalled (2 grep hits: comment + definition).

## 28. Fix architecture

One-token migration: every C-class `await fetch(` -> `await
rvbAuthService.authFetch(` with init byte-identical (same URL/method/headers/
body/credentials/cache). No new wrapper (rule: prefer existing transport). No
`getAuthHeaders` removal (harmless: authFetch overwrites Authorization fresh on
both attempts -- value never survives stale). No auth-helper change
(`authFetch` proven correct pre-migration). Exclusions per section 13.

## 29. Migrated-service matrix

19 files (18 modules + auth-service internals): section 12 counts; each file's
`rvbAuthService` import already existed (verified pre-edit), so diffs are pure
call-site token swaps. rvb-auth.service: 8 authenticated methods migrated
(me/change-password/onboarding/profile/preferences-x2/sessions/revoke-others);
login/refresh/logout stay native (section 13). chat.service HTTP-only migration;
chat-socket untouched.

## 30. authFetch changes, if any

NONE. Zero bytes changed in the helper (diff-proof section 55: only call-site
lines differ). B4-B7 pre-migration proofs stand as its correctness evidence.

## 31. Body-replay analysis

Safe by inventory: zero FormData/Blob/ReadableStream/Request/signal uses in
`frontend/src/services` (grep-verified); every body is a fresh `JSON.stringify`
string or undefined, re-passed identically on retry. No replay machinery needed;
no broad handler invented.

## 32. Permanent files changed

19 files under `H.S.H-V2.0.0/frontend/src/services/`: rvb-worker, rvb-supplier,
rvb-customer, rvb-request, rvb-portal, rvb-notification, rvb-directory,
rvb-account, rvb-activity, rvb-catalog, rvb-config, chat, customer-order,
customer-request, supplier-request, worker-request, worker-activity,
worker-financial-event, rvb-auth. (+104/-104 lines, single-token substitution
only -- machine-verified section 34.)

## 33. FULL BEFORE for every modified permanent file

Universal BEFORE shape (all 104 sites; representative, portal `me()`):
```ts
const r = await fetch(`${BASE}/me`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
```
POST shape (representative, notification mark-all-read):
```ts
const res = await fetch(`${BASE}/mark-all-read`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  body: JSON.stringify({}),
  credentials: "include",
});
```
Machine-verified (in-session command + output): all 104 removed lines match
`await fetch(` and nothing else differs (section 34). Full per-file texts
recoverable via `git show HEAD:<path>`; per-file counts in section 12.

## 34. FULL AFTER for every modified permanent file

Universal AFTER shape -- the identical init with the central transport:
```ts
const r = await rvbAuthService.authFetch(`${BASE}/me`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
```
Completeness proof (run in-session, output recorded):
`git diff -U0 -- services |` minus/plus lines = 104/104, and after normalizing
the single token (`await fetch(` vs `await rvbAuthService.authFetch(`) every
pair is byte-identical => `nonconforming-pairs=0`. No import added (all 19 files
already imported `rvbAuthService` -- verified pre-edit); no init field touched.
`git diff --stat`: 19 files, +104/-104 (plus the expected 027-audit cleanup
deletion elsewhere).

## 35. Verification commands

From `H.S.H-V2.0.0/backend`: `npx tsx tmp-pbs028-baseline.ts` (baseline) and
`$env:PBS028_MODE="postfix"; npx tsx tmp-pbs028-baseline.ts` (post-fix).
From `frontend`: `npx tsc --noEmit`, `npm run lint` (parity check),
`npm run build`. From backend: `npm run test:hsh-sync`. From repo root:
`git diff --name-only` / `--stat`.

## 36. Expired-token post-fix result (F1)

Post-fix, expired token + valid session: `portal.me()` -> success,
`refreshDelta:1`, `tokRotated:true` (new fingerprint). No reload. (Same B3 call
that threw pre-fix.)

## 37. Refresh-count proof (F2)

F1 consumed exactly 1 refresh POST for the one failed request. F9POST/F11 each
exactly 1. No more, no less.

## 38. New-token-on-retry proof (F3)

F1 `tokRotated:true` with distinct pre/post fingerprints; B4 (pre-fix helper
proof) likewise. Retry Authorization provably != expired Bearer (otherwise the
retry would 401 again -- it returns 200). Secrets never printed (8+4
fingerprints only).

## 39. Concurrent-request proof (F4)

3 concurrent migrated calls, one expired token: all fulfilled, `refreshDelta:1`.
Shared refresh + per-request retry all succeed.

## 40. Refresh-failure proof (F6)

Expired token + revoked session via migrated `portal.me()`: threw 401
`RVB_TOKEN_INVALID`, exactly 1 refresh attempt. Surfaces per current contract;
029/030 rules preserved (no state-rule change).

## 41. Second-401 no-loop proof (F7)

`authFetch` at always-401 route: final 401, exactly 1 refresh. No second
attempt, no loop.

## 42. GET service matrix (F8)

Post-fix B8 lines (migrated code): notification list, directory list, portal me
-- all ok; F11 query-string variant ok with 1 refresh. F5 valid-token control:
success with 0 refreshes (B1 rerun pattern in postfix: B3-recovered line shows
recovery; dedicated F1 covers expiry).

## 43. Mutation service matrix (F9)

F9POST: expired token, `markAllRead()` POST -> ok, 1 refresh. First 401 attempt
mutated nothing (backend rejects unauthenticated before handlers); only the
retried call succeeded -- exactly-once effective mutation.

## 44. Header/query/credentials parity (F10-F12)

F10: POST success post-retry proves Content-Type survived (backend JSON parse
required). F11: `?q=W` unchanged through retry (directory ok). F12:
`credentials:"include"` forced by authFetch on both attempts (code) + refresh
cookie actually honored (every recovery used the cookie session) -- behaviorally
proven by all F-successes.

## 45. Post-fix fetch inventory (F13)

Post-fix grep: zero native `fetch(` remain in the 18 modules
(`[^a-zA-Z.]fetch\(` count 0 per file); rvb-auth.service native remains ONLY in
login/doRefreshRequest/logout + authFetch internals (classified section 13).
printing/sync-client/e2e native fetches classified unrelated/test-only.
Every exception documented; no silent bypass.

## 46. Post-fix authFetch usage (F14)

`authFetch(` call counts per file equal the pre-fix native counts exactly
(9/7/8/3/11/7/2/11/1/2/2/16/5/3/3/3/1/2 + 8 internal) -- dead code now live in
every authenticated module.

## 47. 029 boundary proof (F15)

Post-fix, `clearLocal()` (no token + no hint) then `refresh()` -> threw
`RVB_NO_SESSION_HINT`, hint still absent. The 029 gate is byte- and behavior-
identical (no gate file/line in diff). 028 added no bypass (authFetch never
consulted the gate before or after).

## 48. 030/035 untouched proof (F16/F17)

`git diff --name-only` contains neither
`src/contexts/RvbAuthContext.tsx` nor `src/services/chat-socket.service.ts`
(verified in final checks; zero hunks). 030 catch/clear and socket re-auth
behavior preserved exactly.

## 49. Typecheck result (F18)

`npx tsc --noEmit` (frontend) -> exit 0, no output, post-fix final tree.

## 50. Lint result (F19)

Full `npm run lint`: 3117 problems post-fix; targeted 4-file comparison
(portal/worker/chat/auth): 71 problems post-fix vs 71 at HEAD (via stash) --
identical; zero `authFetch`/`no-undef` findings on the touched lines. Lint
debt is pre-existing and untouched (nothing repaired silently).

## 51. Production-build result (F20)

`npm run build` (frontend, post-fix) -> success: full route table emitted
(Static/Dynamic + Proxy), no bundling/cycle errors from the 19-file transport
swap.

## 52. Backend integration result (F21)

Refresh endpoint + cookie/session behavior exercised really in every recovery
(rotated tokens accepted, revoked sessions rejected); zero backend production
files in diff (`git diff --name-only` shows none).

## 53. HSH sync-suite result (F22)

`npm run test:hsh-sync` (backend, post-fix) -> `34 passed, 0 failed`.

## 54. 022-027 regression/scope proof (F23)

`sync-service.ts` absent from diff (022 weight alias, 023 notification guards,
024 payment gate, 025 presence gates, 026 invoice normalization all byte-intact);
027 had no production fix; no frontend file outside the 19 service modules
changed; no backend file changed at all.

## 55. git diff/status proof (F24)

`git diff --name-only` (repo root, final): 19 frontend service files (section
32) + `TEMP-PBS-BUG-027-AUDIT.md` (expected prior-cycle cleanup deletion).
`git diff --stat`: +104/-104 across services. Zero backend, zero mobile, zero
context/socket/model/config changes. Untracked: `TEMP-PBS-BUG-028-AUDIT.md`
only (after disposable removal).

## 56. Remaining uncertainty

1. Browser-only surfaces (cookie `SameSite`/partitioning, tab-concurrent
   refresh across tabs sharing HttpOnly cookie) are exercised by design
   (shared server session) but not multi-tab tested -- single-process harness
   proves the promise-dedupe, not cross-tab races. LOW (server rotation is
   atomic per refresh; worst case is one redundant refresh).
2. `me()`-family calls inside `RvbAuthContext` startup now also self-heal via
   authFetch (they are migrated methods) -- strictly an improvement, but its
   interaction with 030's catch-clear is 030's cycle to characterize. LOW.
3. Services added in future must use `authFetch` -- no lint rule enforces it;
   noted as a follow-up opportunity, not a 028 gap. LOW.

## 57. Final status

FIXED — READY FOR GIORNO REVIEW
