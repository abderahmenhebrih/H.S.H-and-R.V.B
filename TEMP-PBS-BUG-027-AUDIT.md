# TEMP-PBS-BUG-027-AUDIT -- RVB request/order linkage-freshness allegation

Status: **NOT FIXED** (no defect reproduced; permanent source left unchanged).
Disposition recommendation: **REJECTED -- NOT A BUG** (see section 48).
Bug remains open -- only Giorno may disposition it as CLOSED / REJECTED / NEEDS VERIFICATION.

Date (UTC): 2026-09-27.
Workspace: `C:\Users\islam\OneDrive\Desktop\poultry-business-suite`
Runtime under test: backend `tsx` + `mongoose 9.9.3` + `mongodb-memory-server 11.3.0`
(single-node replica set), driving the REAL Express routers +
REAL `requireRvbAuth` + REAL JWT + REAL Mongoose models via supertest.
No core mocks. Node v22.

START-OF-CYCLE CLEANUP (PBS-BUG-026 is CLOSED):
- Deleted `TEMP-PBS-BUG-026-AUDIT.md` (was committed; now shows as `D`).
- No `tmp-pbs026`/`tmp-probe26` remnants remained at cycle start (removed in-cycle
  during 026); nothing else removed.
- The permanent PBS-BUG-026 incomingInvoice normalization + currency fallback was
  NOT reverted -- verified intact in final checks (4 markers).

---

## 1. Bug definition

PBS-BUG-027 (alleged): RVB request/order routes scope by the authentication-time
`req.rvbUser.account.linkedEntityId` snapshot instead of the current RvbAccount,
so admin relink/unlink changes stay invisible until the access token expires
(~15 min), letting an old token list/create against the stale entity while portal
routes already show the fresh linkage.

## 2. Exact meaning of "auth-time snapshot" in current code

The phrase is a MISNOMER for current code. `requireRvbAuth`
(`backend/src/middleware/rvb-auth.ts` L17-79) runs on EVERY HTTP request
(all four target routers mount it via `router.use`): it verifies the JWT
(signature + expiry only), extracts the STABLE `accountId`, then FRESH-READS
`RvbAccountModel.findOne({ id: accountId }).lean()` (L43), rechecks
`status === "active"` (L48-52) and live session validity (L60-63), and builds
`req.rvbUser.account = toSafeRvbAccount(freshAccountDoc)` (L66-73). So
"auth-time" = per-request middleware time, and the snapshot is at most
milliseconds old on every request. The JWT itself carries NO linkage
(proven B12: claims are exactly `accountId/tag/role/sessionId` + `iat/exp`;
`linkedEntityId` absent; TTL 15 min). There is NO login-time snapshot anywhere
in the request path. The historical premise (stale-until-expiry) is therefore
false for current code -- and runtime B2/B4/B6-B9 confirm it.

## 3. RvbAccount model/linkage contract

`backend/src/models/rvb-account.model.ts`: `id` (unique), `tag` (unique),
`displayName`, `role` enum [manager, admin, supervisor, worker, supplier,
customer], `linkedEntityType` enum [worker, supplier, customer] (default null),
`linkedEntityId` (default null), `status` enum [active, archived, disabled]
(default active), onboarding/profile/password fields. Unique sparse-ish index on
(linkedEntityType, linkedEntityId) -- one account per entity (observed at runtime:
second link to a taken entity fails E11000; harness uses distinct Y entities per
test). `toSafeRvbAccount` (lib/rvb-auth.ts L60-69) strips only
`_id/__v/passwordHash/linkedEntityLifecyclePriorStatus/refreshTokenHash` --
`linkedEntityId/Type` always survive. No tokenVersion/sessionVersion field exists;
relink/unlink (`linkRvbAccount`/`unlinkRvbAccount` in rvb-account.service.ts)
update ONLY the DB document -- tokens are NOT invalidated (and do not need to be,
since every request re-reads).

## 4. Authentication middleware trace

Per section 2 + full read of `middleware/rvb-auth.ts` (94 lines): token from
Bearer/cookie/header -> `verifyAccessToken` (throws -> 401 RVB_TOKEN_INVALID) ->
`accountId = payload.accountId || payload.id` (STABLE key, never the linkage) ->
fresh `findOne` -> 401 if missing -> 403 RVB_ACCOUNT_ARCHIVED/DISABLED if not
active (fresh status) -> session live-check (revokedAt null + expiresAt future,
else 401 RVB_SESSION_REVOKED) -> `req.rvbUser = {accountId, tag, role, status,
sessionId, account: safe(freshDoc)}` -> `requireRvbRole` compares the FRESH role.
Every request re-authenticates against current DB state; the only JWT-carried
inputs are identity keys, never authorization state.

## 5. Portal fresh-read reference

`routes/rvb-portal.ts`: `/me` (L55-80) plus per-role endpoints re-read
`RvbAccountModel.findOne({ id: user.accountId }).lean()` then derive linkage.
This is the SAME query the middleware already performed milliseconds earlier --
portal is NOT fresher than the request routes; both observe current DB state.
Used in harness as the parity oracle (`GET /api/rvb/portal/me` ->
`linkedEntityId`).

## 6. Full affected-route endpoint inventory

- worker-requests.ts (111 lines): GET / (list), POST / (create), POST /:id/review
  (manager/admin only).
- supplier-requests.ts (100 lines): GET /, POST /, POST /:id/review (manager/admin).
- customer-requests.ts (98 lines): GET /, POST /, POST /:id/review
  (manager/admin/supervisor).
- customer-orders.ts (115 lines): GET / (list), POST / (create),
  POST /:id/review (manager/admin/supervisor), POST /:id/cancel + PATCH /:id
  (customer, ownership via accountId -- see section 8).

## 7. Route-by-route linkedEntityId source matrix

Every non-manager/admin scoping read in all four files is
` (user.account)?.linkedEntityType / .linkedEntityId` where `user.account` is the
middleware's per-request fresh doc (A = fresh-DB-via-middleware, NOT a login
snapshot): worker list/create (L28-29/L61-62), supplier list/create
(L23-24/L54-55), customer-request list/create (L21-22/L51-52), customer-order
list/create (L21-22/L49-50). Manager/admin/supervisor-explicit paths use explicit
query/body ids (C). Cancel/edit order paths use document ownership + accountId
(D). Review paths use reviewer accountId only. Zero endpoints read linkage from
JWT claims (claims contain none -- B12). Zero endpoints cache linkage.

## 8. Service-layer fresh/stale matrix

CREATE services re-fetch CURRENT account and enforce linkage independently (all
fresh, E): `createWorkerRequest` (L35: fresh findOne + 403 on linked-mismatch),
`createSupplierRequest` (+403), `createCustomerRequest` (+403),
`createCustomerOrder` (+403). LIST services take a plain entity id from the route
(no account input) -- but the route passes the middleware-fresh id, so the chain
is fresh end-to-end. `cancel/editCustomerOrder` scope by `(id, accountId)`
ownership (D, linkage-independent). `review*` services check reviewer/manager
roles only. No service consumes a stale id in any path the routes can reach.

## 9. Role matrix

- worker-requests: worker + supervisor (own-linkage scoped), manager/admin
  (explicit workerId). Supervisor inclusion is an existing authorization decision
  (explicitly NOT the bug; preserved; B9 proves fresh scoping for supervisor too).
- supplier-requests: supplier (own), manager/admin (explicit).
- customer-requests: customer (own), manager/admin/supervisor (explicit/filtered).
- customer-orders: customer (own create/list/cancel/edit), manager/admin/supervisor
  (review + explicit list). No role-policy change made or needed.

## 10. Lifecycle/relink path

`linkRvbAccount` (requires currently-unlinked account + existing entity + no
conflicting link), `unlinkRvbAccount` (nulls the linkage), plus
archive/reactivate/disable and `applyLinkedEntityLifecycleToRvbAccount` -- all
pure DB mutations; none touch tokens/sessions (no version field exists). The old
JWT stays cryptographically valid until its 15-min expiry, but since every
request re-reads the account, relink/unlink/archive take effect on the VERY NEXT
request with the old token (proven B2/B4/B11). No logout forcing, no TTL change,
no versioning needed.

## 11. Current access-token TTL/session behavior

`getAccessTTL()` default `"15m"` (env RVB_ACCESS_TOKEN_TTL); refresh 30d. B12
measures `exp-iat = 15 min` on a real issued token. Sessions are live-checked per
request (revokedAt/expiresAt); relink does not revoke sessions -- and does not
need to. The "stale window = token lifetime" claim is refuted: measured stale
window is ZERO requests (B2 immediate).

## 12. Baseline runtime environment (Phase B)

Disposable `backend/tmp-pbs027-baseline.ts` (deleted after the cycle): memory
replset + Express mounting the REAL four routers + REAL portal router behind REAL
`requireRvbAuth`, supertest HTTP, REAL JWT via `signAccessToken` (test secrets via
env), REAL models. Same-token discipline: token string captured once per account
and reused verbatim after direct `RvbAccountModel.updateOne` linkage mutations
(relink AND unlink AND archive). Unique entities per relink target (respects the
unique link index). Distinct X/Y rows per entity for ID-level scope proof.
Rate limit (30/min/account) respected via per-test accounts.

## 13. Worker initial control (B1)

Token issued while linked WX: `GET worker-requests -> [WRX]` (200),
portal `/me -> WX`. Baseline locked.

## 14. Worker relink list reproduction (B2)

DB `WX -> WY`, SAME token string: `GET -> [WRY]` (200), portal `-> WY`,
`stale:false` (no WRX id present). BUG SIGNATURE ABSENT: route behaves as Y,
agreeing with portal. This is the primary historical file -- NOT reproduced.

## 15. Worker create-after-relink result (B3)

Same old token, `POST {discrepancy}` -> 201 with `workerId: WY` (route-fresh id
+ service fresh-check agree). No creation against X. NOT reproduced.

## 16. Worker unlink result (B4)

Fresh account/token on WX, then DB unlink (both fields null), same token:
list -> 403 (empty), create -> 403, portal `linkedEntityId: null`. Fail-closed
fresh semantics; stale X rows NOT exposed. NOT reproduced.

## 17. Supplier reproduction (B6)

SX -> SY, same token: list `[SRY]`, create 201 for `SY`. NOT reproduced.

## 18. Customer request reproduction (B7)

CX -> CY, same token: list `[CRY]`, create 201 for `CY`. NOT reproduced.

## 19. Customer order reproduction (B8)

CX2 -> CY2, same token: list `[COY2]`, create 201 for `CY2`. NOT reproduced
(note: order items require client `price` per shared `validateItems` -- harness
sends it; server reprices authoritatively; unrelated to linkage).

## 20. Supervisor result (B9)

Supervisor WX -> WY2, same token: list `[WRX]` then `[WRY2]`. Same freshness;
role authorization untouched. NOT reproduced (and no role change made).

## 21. Manager/Admin control (B10)

Manager explicit `?workerId=WX` before/after another account's relink:
`[WRX]` both times. Explicit-target paths linkage-independent and stable.

## 22. Archive/deactivate result (B11)

Account archived in DB, same token: list -> 403 `RVB_ACCOUNT_ARCHIVED`.
Fresh per-request status check fail-closes; no new policy needed.

## 23. Same-token proof (F9-equivalent)

Every B2-B9/B11 second call reuses the captured token string verbatim (single
variable per account; no re-login; `sameToken:true` logged for B2). No test
"fixes" itself with a fresh login.

## 24. Exact confirmed affected endpoints

NONE. Zero of the examined endpoints exhibit stale linkage: worker/supplier/
customer-request and customer-order list + create (all roles incl. supervisor),
unlink fail-closed, archive fail-closed. The decision-gate CASE 1 condition is
met (middleware fresh-fetch proven + B2 not reproduced).

## 25. Exact unaffected endpoints

All of them (same set): review paths (manager/admin, linkage-independent),
manager/admin/supervisor explicit-id paths, cancel/edit ownership paths, plus
portal endpoints. B10 locks the explicit path.

## 26. Root cause

No root cause exists because there is no defect: the premise mistook the
per-request middleware DB read for a login-time JWT snapshot. The JWT carries no
linkage; every request rebuilds `req.rvbUser.account` from the current document;
services double-check on create. The re-audit's static evidence (routes read
`user.account.linkedEntityId`) is TRUE but innocuous -- that object is fresh.

## 27. Fix architecture

No fix. Any "fresh helper" would duplicate the identical query the middleware
already performs per request (same collection, same key, milliseconds apart) --
pure overhead with zero behavior change. Rejected per rules 6/8 and decision-gate
CASE 1.

## 28. Fresh account lookup semantics

Already authoritative: stable JWT `accountId` -> fresh `findOne` per request.
No change.

## 29. Failure behavior when current link absent

Already fail-closed and fresh: unlinked -> 403 RVB_FORBIDDEN (routes),
archived/disabled -> 403 RVB_ACCOUNT_ARCHIVED/DISABLED (middleware), missing ->
401. Measured B4/B11 with the stale-era token. No change.

## 30. Permanent files changed

NONE. Zero permanent production source files modified. `git diff --name-only`
(HEAD) shows ONLY the START-OF-CYCLE `TEMP-PBS-BUG-026-AUDIT.md` deletion.
`git status` adds solely the untracked `TEMP-PBS-BUG-027-AUDIT.md` (this file).
All 027 harness disposables removed after evidence collection.

## 31. FULL BEFORE for every modified permanent file

Not applicable -- no permanent file modified. Relevant CURRENT (unchanged) code
quoted verbatim in sections 2/4/7/8 with file/line anchors
(middleware L42-73; four routers; four create services; portal L55-80).

## 32. FULL AFTER for every modified permanent file

Not applicable -- AFTER == BEFORE == HEAD.

## 33. Verification commands

From `H.S.H-V2.0.0/backend`:
1. `npx tsx tmp-pbs027-baseline.ts` -> 12/12 JSONL lines green (sections 13-23;
   full stdout captured in-session; script removed afterwards).
2. `npx tsc --noEmit` -> exit 0 (final tree; see section 44).
3. `npm run test:hsh-sync` -> 34/34 (section 43; backend touched by nothing).
4. `git diff HEAD --name-only` -> sync-service.ts absent; only 026-audit deletion.

## 34-38. Post-fix results (worker/supplier/customer-request/customer-order)

Not applicable (no fix). The BASELINE results ARE the proof: B2 `[WRY]`/WY,
B3 `WY`, B6 `[SRY]`/SY, B7 `[CRY]`/CY, B8 `[COY2]`/CY2 -- every family returns
and creates under the CURRENT linkage with the OLD token, zero X-only rows,
portal agreement on each family (portal probed directly for worker; same query
serves all roles).

## 39. Supervisor/manager regression results

No regression possible (no change). Baselines B9 (supervisor fresh `[WRX]`->
`[WRY2]`) and B10 (manager explicit stable) document the preserved semantics.

## 40. Portal parity proof

B2 (portal WY == route [WRY]), B4 (portal null == route 403s). Portal and routes
read the same current document; parity holds trivially because both are fresh --
the alleged portal/route split does not exist.

## 41. Data-isolation proof (incl. B5)

B5 is covered by construction: X and Y each hold distinguishable rows
(WRX/WRY, SRX/SRY, CRX/CRY, COX2/COY2) and every post-relink list is asserted
at ID level.

Relink suites assert ID-level exclusion: post-relink lists contain ONLY the new
entity's ids (`stale:false` computed against X ids in B2; Y-only arrays in
B6-B9). No X rows leak; creates attribute to Y (B3/B6/B7/B8 `createdFor`).

## 42. Same-token post-fix proof

No post-fix state exists; the same-token discipline of the BASELINE run (section
23) stands as the evidence that freshness holds without re-login.

## 43. Backend test results (F15-equivalent)

No RVB route/auth suite exists in package.json scripts (`dev/build/start/
rvb:bootstrap-manager/test:hsh-sync` only -- verified). Nothing to run beyond the
purpose-built harness; no command invented.

## 44. HSH sync-suite result (F16-equivalent)

`npm run test:hsh-sync` -> `34 passed, 0 failed` (backend untouched; expected
green, confirmed in final checks).

## 45. TypeScript result (F17)

`npx tsc --noEmit` -> exit 0, no output (final tree after disposable removal).

## 46. 022-026 regression proof (F19)

`git diff HEAD --name-only` contains no `sync-service.ts` (022 weight alias,
023 notification guards/feed, 024 payment gate, 025 presence gates + allowlist,
026 invoice normalization/currency all byte-intact in HEAD and working tree);
marker counts re-verified in final checks (022 x1, 023 x7, 024 x2, 025 x6,
026 x4). Zero frontend files. F18 lint: backend ESLint still unconfigured
(re-confirmed; nothing installed).

## 47. Diff-scope proof (F20)

`git diff HEAD --name-only` = `TEMP-PBS-BUG-026-AUDIT.md` (expected prior-cycle
cleanup deletion) ONLY, plus untracked `TEMP-PBS-BUG-027-AUDIT.md`. No production
file added, modified, or deleted. (Note: `git status --short` may show a
stat-dirty `M POULTRY-SUITE-RECOVERY-AUDIT.md`, but `git hash-object` matches the
HEAD blob and `git diff HEAD` excludes it -- content-identical, pre-existing
racy-clean state, not a modification.)

## 48. Final status

NOT FIXED
