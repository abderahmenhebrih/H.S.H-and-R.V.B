# TEMP-PBS-BUG-032-AUDIT (PBS-BUG-032 — `getWorkerFinancial()` wrong endpoint)

Cycle scope: PBS-BUG-032 ONLY. PRE-FIX parent commit: `0efa1f3` (master, "050").
PBS-BUG-030 is CLOSED; its production changes are preserved and untouched.

## 1. Bug definition

RVB Web `rvbPortalService.getWorkerFinancial()` requested
`GET /api/rvb/portal/worker/financial`, but the current backend mounts only
`GET /api/rvb/portal/worker/financial-events`. No `/worker/financial` alias
exists, so the request 404s. Both live callers in `app/rvb/page.tsx`
(`WorkerPortal`, `SupervisorPortal`) append `.catch(() => [])`, converting the
deterministic 404 into a silently empty financial panel.

## 2. Current rvb-portal service inventory

`H.S.H-V2.0.0/frontend/src/services/rvb-portal.service.ts` (63 lines, no
refactor in this cycle). All methods use `rvbAuthService.authFetch()` with
`cache: "no-store"`, `{ ...getAuthHeaders() }`, `credentials: "include"`:

| method | URL (BASE=`…/api/rvb/portal`) | returns |
|---|---|---|
| `me()` | `/me` | full `{success,account,entity,entityType}` (031 dead mismatch — untouched) |
| `getWorker()` | `/worker` | `d.worker` |
| `getWorkerFinancial()` | `/worker/financial` (WRONG) | `d.events \|\| []` |
| `getWorkerActivities()` | `/worker/activities` | `d.activities \|\| []` |
| `getSupplier()` | `/supplier` | `d.supplier` |
| `getSupplierPurchases()` | `/supplier/purchases` | `d.purchases \|\| []` |
| `getSupplierPayments()` | `/supplier/payments` | `d.payments \|\| []` |
| `getCustomer()` | `/customer` | `d.customer` |
| `getCustomerSales()` | `/customer/sales` | `d.sales \|\| []` |
| `getCustomerPayments()` | `/customer/payments` | `d.payments \|\| []` |
| `getCustomerOrders()` | `/customer/orders` | `d.orders \|\| []` |

## 3. Current getWorkerFinancial implementation

- Full request URL: `${BASE}/worker/financial`
  → `http://<API>/api/rvb/portal/worker/financial`.
- Transport: `rvbAuthService.authFetch()` (028 migration intact, NOT native fetch).
- Headers: `{ ...getAuthHeaders() }` (Bearer memory token if present).
- Credentials: `"include"` (HttpOnly refresh cookie). Cache: `"no-store"`.
- Expected response type: `{ success: boolean; events: any[] }`.
- Returned value: `d.events || []`.
- Error handling: none locally; `handleRes` throws `{status: 404,
  code: undefined, data: {}}` on the 404 (Express no-match body is non-JSON
  HTML → `res.json().catch(() => ({}))` → `code` undefined, message
  `"Request failed 404"`).

## 4. Current backend portal route inventory

`H.S.H-V2.0.0/backend/src/routes/rvb-portal.ts` (368 lines, COMPLETE read).
Mounted at `/api/rvb/portal` (server.ts) with router-wide `requireRvbAuth`.
Exact `router.get` strings: `/me`, `/worker`, `/worker/financial-events`,
`/worker/activities`, `/supplier`, `/supplier/purchases`,
`/supplier/payments`, `/customer`, `/customer/sales`, `/customer/payments`,
`/customer/orders`. **No `GET /worker/financial` route or alias exists**
(repo-wide grep for `portal/worker/financial` hits only the comment on line
113 describing `/worker/financial-events`). Express returns its default
non-JSON 404 for the wrong URL.

## 5. Correct backend endpoint contract

`GET /api/rvb/portal/worker/financial-events` (routes/rvb-portal.ts:114-139):
fresh `RvbAccountModel.findOne({id: user.accountId})`; role must be `worker`
or `supervisor` (from FRESH account, else 403 `RVB_FORBIDDEN`);
`linkedEntityType === "worker"` + `linkedEntityId` required (else 404
`RVB_LINKED_ENTITY_NOT_FOUND`); query =
`WorkerFinancialEventModel.find({workerId: linkedId}).sort({createdAt: -1})`
(server-side scoping, query params ignored); strips
`_id/__v/syncStatus/serverRevision/lastSyncedAt`; responds 200
`{success: true, workerId: linkedId, events: cleaned}`. Exceptions → 500
`INTERNAL_ERROR`.

## 6. Current role/scoping contract

Worker linked to X → own X events. Supervisor linked to a worker → that
worker's events (same handler; supervisor tested linked to Y → 200 + Y's 1
event). Unrelated roles (manager, no link) → 403 `RVB_FORBIDDEN`. No link →
404 `RVB_LINKED_ENTITY_NOT_FOUND`. Unchanged by this cycle.

## 7. Current response shape

`{success: true, workerId: string, events: cleaned[]}`; event DTO retains
`id, createdAt, updatedAt, workerId, type, amount, balanceBefore,
balanceAfter, note, actorId, actorTag, referenceId`; newest-first by
`createdAt`. Runtime sample (B2-event0):
`{"id":"pbs032-ev-new","createdAt":…,"updatedAt":…,"workerId":"pbs032-wx","type":"salary","amount":1000,"balanceBefore":1200,"balanceAfter":2200,"note":"note-pbs032-ev-new","actorId":null,"actorTag":null,"referenceId":null}`.

## 8. Current web caller inventory

Exactly TWO live callers (whole-frontend grep for `getWorkerFinancial`):
1. `frontend/app/rvb/page.tsx:361` — `WorkerPortal.load()` (`Promise.all`,
   role=worker path).
2. `frontend/app/rvb/page.tsx:892` — `SupervisorPortal.load()` (supervisor path).
No aliases/destructuring; no other callers.

## 9. `.catch(() => [])` impact

Both callers: `rvbPortalService.getWorkerFinancial().catch(() => [])` →
`setFinancial(Array.isArray(fin) ? fin : [])`. Panels render
`financial.length === 0 ? t.noData : financial.slice(0,30|15).map(...)`
(page.tsx:425-428 worker, 943-946 supervisor). The deterministic 404 therefore
renders as legitimate "no data". Per rule 4 the swallowing policy is NOT
changed: after the URL fix the catch stays but is dormant on healthy requests
(proven F-caller n=2).

## 10. Mobile reference

`R.V.B-mobile/src/services/worker.service.ts:15` targets
`"/api/rvb/portal/worker/financial-events"` — already correct. Reference only;
mobile untouched. (Management-service line 141 uses the separate
`/api/rvb/workers/${id}/financial-events` management route — out of scope.)

## 11. Contract/doc conflict findings

- `DEBUG-PROBLEM-INVENTORY.md:1370` documents the 404→`[]` mechanism — an
  accurate bug description, not a stale contract. No edit.
- `H.S.H-V2.0.0/RVB-MOBILE-CONTRACT.md:91` documents
  `GET /api/rvb/portal/worker/financial` as contract, but mobile code actually
  calls `/financial-events`. Stale doc noted; per rule A7 ("prefer no doc
  edit") NOT edited in this cycle.

## 12. PBS-BUG-028 transport boundary

Pre-fix line 19 and post-fix line 19 both use `rvbAuthService.authFetch()`
with identical options. The one-token URL change cannot and did not revert
the 028 migration (F9 proof in sec 39).

## 13. Runtime environment

Real backend (express mounting REAL `rvb-auth` + `rvb-portal` routers, real
`requireRvbAuth`/JWT/models) on `MongoMemoryReplSet`; REAL frontend
`rvbPortalService` + `rvbAuthService` modules imported from source over HTTP
with Node cookie jar (HttpOnly semantics) + `localStorage` shim; supertest
agents with real Bearer tokens for direct endpoint controls. No mocks for the
route mismatch. No browser run (service + exact caller pattern is exact;
sec 50).

## 14. Fixture definition

- Worker X `pbs032-wx`, Worker Y `pbs032-wy`, Worker Z `pbs032-wz` (zero events).
- Account A `pbs032a` role=worker linked worker/X; account C `pbs032c`
  role=worker linked worker/Z; account S `pbs032s` role=supervisor linked
  worker/Y (unique link index forbids sharing X); account M `pbs032m`
  role=manager unlinked. All password `Passw0rd!x`, status active.
- Events: `pbs032-ev-old` (X, bonus, 200, 1000→1200, t-20s),
  `pbs032-ev-new` (X, salary, 1000, 1200→2200, t-5s),
  `pbs032-ev-y` (Y, payment, 150, 800→650, t-10s).

## 15. Correct endpoint baseline

`[pbs032] B2-correct status=200 workerId=pbs032-wx ids=pbs032-ev-new,pbs032-ev-old hasY=false`
200, `success:true`, newest-first ordering, zero Y leakage.

## 16. Wrong endpoint baseline

`[pbs032] B3-wrong status=404 body={}`
Same authenticated token → Express no-match 404 (not 401/403/fixture error).
Isolates the defect to the route string.

## 17. Actual web service baseline

`[pbs032] B4-service THROW status=404 code=undefined refresh=0 urls=/rvb/portal/worker/financial:404`
Current `getWorkerFinancial()` requests the wrong URL, `handleRes` throws 404,
and (valid token) causes zero refresh traffic.

## 18. Live caller swallow baseline

`[pbs032] B5-caller result=[] (backend has 2 X events)`
`await getWorkerFinancial().catch(() => [])` → `[]` while 2 events exist
server-side and the correct endpoint returns them. Silent-empty user-visible
behavior proven.

## 19. Legitimate-empty control

`[pbs032] B6-empty status=200 events=[]`
Worker Z (zero events) on the CORRECT endpoint → 200 `[]`, not 404.
Distinguishes genuine empty history from wrong-route-converted-to-empty.

## 20. Role control

`[pbs032] B7-supervisor status=200 n=1 workerId=pbs032-wy`
`[pbs032] B7-manager status=403 code=RVB_FORBIDDEN`
`[pbs032] B7-manager-wrongurl status=404`
Supervisor allowed with own-link scoping; manager rejected 403 on the real
route (404 on the wrong URL is route-miss, expected). Role rules untouched.

## 21. 028 authFetch control

`[pbs032] B8-expired THROW status=404 code=undefined refresh=1 urls=/rvb/portal/worker/financial:401 | /rvb/auth/refresh:200 | /rvb/auth/refresh:200→retry /rvb/portal/worker/financial:404`
Corrupt access + valid session: authFetch refreshed once (200) and retried,
still 404 only because the URL is wrong. Separates 028 recovery (works) from
032 mismatch. Post-fix B8 succeeds (sec 39).

## 22. Decision-gate result

CASE 1 — bug reproduces: correct endpoint 200 (sec 15), current service 404
(sec 17), two live callers (sec 8). No `/financial` backend alias (sec 4);
service already used the wrong URL (not CASE 2/3); no other defect blocks data
(not CASE 4). Narrow fix proceeds.

## 23. Exact root cause

Single wrong endpoint string in `getWorkerFinancial()`:
`${BASE}/worker/financial` instead of `${BASE}/worker/financial-events`,
against a backend that mounts only the latter. Caller `.catch(() => [])`
masks the resulting 404 as empty history.

## 24. Fix architecture

One-token endpoint-string change in `rvb-portal.service.ts` line 19.
Preserved exactly: `authFetch`, cache, headers, credentials, `handleRes`,
response type, `return d.events || []`. No fallback, no backend alias, no
caller/UI/auth/schema/sort/permission/shape changes, no mobile changes.

## 25. Permanent files changed

ONLY: `H.S.H-V2.0.0/frontend/src/services/rvb-portal.service.ts` (1 line).

## 26. COMPLETE FULL BEFORE

A. Path: `H.S.H-V2.0.0/frontend/src/services/rvb-portal.service.ts`
B. Full before body (PRE-FIX parent `0efa1f3` blob
   `7262c424e750341c6e7eb68b26df516459bab7e4`; worktree was clean at cycle
   start, so HEAD blob == pre-fix file):

<!-- BLOCK:BEFORE -->
```ts
"use client";
import { rvbAuthService } from "./rvb-auth.service";
const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
const BASE = `${API_BASE}/api/rvb/portal`;
function getAuthHeaders(): Record<string, string> { const t = rvbAuthService.getAccessToken(); return t ? { Authorization: `Bearer ${t}` } : {}; }
async function handleRes<T>(res: Response): Promise<T> { const d = await res.json().catch(() => ({})); if (!res.ok) { const e: any = new Error(d?.code || d?.message || `Request failed ${res.status}`); e.code = d?.code; e.status = res.status; e.data = d; throw e; } return d as T; }
export const rvbPortalService = {
  async me(): Promise<any> {
    const r = await rvbAuthService.authFetch(`${BASE}/me`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; account: any; entity: any; entityType: string }>(r);
    return d;
  },
  async getWorker(): Promise<any> {
    const r = await rvbAuthService.authFetch(`${BASE}/worker`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; worker: any }>(r);
    return d.worker;
  },
  async getWorkerFinancial(): Promise<any[]> {
    const r = await rvbAuthService.authFetch(`${BASE}/worker/financial`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; events: any[] }>(r);
    return d.events || [];
  },
  async getWorkerActivities(): Promise<any[]> {
    const r = await rvbAuthService.authFetch(`${BASE}/worker/activities`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; activities: any[] }>(r);
    return d.activities || [];
  },
  async getSupplier(): Promise<any> {
    const r = await rvbAuthService.authFetch(`${BASE}/supplier`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; supplier: any }>(r);
    return d.supplier;
  },
  async getSupplierPurchases(): Promise<any[]> {
    const r = await rvbAuthService.authFetch(`${BASE}/supplier/purchases`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; purchases: any[] }>(r);
    return d.purchases || [];
  },
  async getSupplierPayments(): Promise<any[]> {
    const r = await rvbAuthService.authFetch(`${BASE}/supplier/payments`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; payments: any[] }>(r);
    return d.payments || [];
  },
  async getCustomer(): Promise<any> {
    const r = await rvbAuthService.authFetch(`${BASE}/customer`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; customer: any }>(r);
    return d.customer;
  },
  async getCustomerSales(): Promise<any[]> {
    const r = await rvbAuthService.authFetch(`${BASE}/customer/sales`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; sales: any[] }>(r);
    return d.sales || [];
  },
  async getCustomerPayments(): Promise<any[]> {
    const r = await rvbAuthService.authFetch(`${BASE}/customer/payments`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; payments: any[] }>(r);
    return d.payments || [];
  },
  async getCustomerOrders(): Promise<any[]> {
    const r = await rvbAuthService.authFetch(`${BASE}/customer/orders`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; orders: any[] }>(r);
    return d.orders || [];
  },
};
```

## 27. COMPLETE FULL AFTER

C. Full after body (working tree, git object
   `cfaea76ceebb3ffe742d920ba2f68f6a48352c89`):

<!-- BLOCK:AFTER -->
```ts
"use client";
import { rvbAuthService } from "./rvb-auth.service";
const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
const BASE = `${API_BASE}/api/rvb/portal`;
function getAuthHeaders(): Record<string, string> { const t = rvbAuthService.getAccessToken(); return t ? { Authorization: `Bearer ${t}` } : {}; }
async function handleRes<T>(res: Response): Promise<T> { const d = await res.json().catch(() => ({})); if (!res.ok) { const e: any = new Error(d?.code || d?.message || `Request failed ${res.status}`); e.code = d?.code; e.status = res.status; e.data = d; throw e; } return d as T; }
export const rvbPortalService = {
  async me(): Promise<any> {
    const r = await rvbAuthService.authFetch(`${BASE}/me`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; account: any; entity: any; entityType: string }>(r);
    return d;
  },
  async getWorker(): Promise<any> {
    const r = await rvbAuthService.authFetch(`${BASE}/worker`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; worker: any }>(r);
    return d.worker;
  },
  async getWorkerFinancial(): Promise<any[]> {
    const r = await rvbAuthService.authFetch(`${BASE}/worker/financial-events`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; events: any[] }>(r);
    return d.events || [];
  },
  async getWorkerActivities(): Promise<any[]> {
    const r = await rvbAuthService.authFetch(`${BASE}/worker/activities`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; activities: any[] }>(r);
    return d.activities || [];
  },
  async getSupplier(): Promise<any> {
    const r = await rvbAuthService.authFetch(`${BASE}/supplier`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; supplier: any }>(r);
    return d.supplier;
  },
  async getSupplierPurchases(): Promise<any[]> {
    const r = await rvbAuthService.authFetch(`${BASE}/supplier/purchases`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; purchases: any[] }>(r);
    return d.purchases || [];
  },
  async getSupplierPayments(): Promise<any[]> {
    const r = await rvbAuthService.authFetch(`${BASE}/supplier/payments`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; payments: any[] }>(r);
    return d.payments || [];
  },
  async getCustomer(): Promise<any> {
    const r = await rvbAuthService.authFetch(`${BASE}/customer`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; customer: any }>(r);
    return d.customer;
  },
  async getCustomerSales(): Promise<any[]> {
    const r = await rvbAuthService.authFetch(`${BASE}/customer/sales`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; sales: any[] }>(r);
    return d.sales || [];
  },
  async getCustomerPayments(): Promise<any[]> {
    const r = await rvbAuthService.authFetch(`${BASE}/customer/payments`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; payments: any[] }>(r);
    return d.payments || [];
  },
  async getCustomerOrders(): Promise<any[]> {
    const r = await rvbAuthService.authFetch(`${BASE}/customer/orders`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; orders: any[] }>(r);
    return d.orders || [];
  },
};
```

## 28. COMPLETE literal unified diff

D. Literal `git diff HEAD -- <file>`:

<!-- BLOCK:DIFF -->
```diff
diff --git a/H.S.H-V2.0.0/frontend/src/services/rvb-portal.service.ts b/H.S.H-V2.0.0/frontend/src/services/rvb-portal.service.ts
index 7262c42..cfaea76 100644
--- a/H.S.H-V2.0.0/frontend/src/services/rvb-portal.service.ts
+++ b/H.S.H-V2.0.0/frontend/src/services/rvb-portal.service.ts
@@ -16,7 +16,7 @@ export const rvbPortalService = {
     return d.worker;
   },
   async getWorkerFinancial(): Promise<any[]> {
-    const r = await rvbAuthService.authFetch(`${BASE}/worker/financial`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
+    const r = await rvbAuthService.authFetch(`${BASE}/worker/financial-events`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
     const d = await handleRes<{ success: boolean; events: any[] }>(r);
     return d.events || [];
   },
```

## 29. Machine byte-verification

Method (LF-normalized): BEFORE block vs `git cat-file -p HEAD:<path>`;
AFTER block vs working-tree bytes; DIFF block vs `git diff HEAD -- <path>`.
Script and result (executed after writing this file):

```text
BEFORE MATCH
AFTER MATCH
DIFF MATCH
```

(`git hash-object` worktree = `cfaea76…` = diff `index` new hash;
`git rev-parse HEAD:` = `7262c42…` = diff `index` old hash.)

## 30. Verification commands

- `npx tsx tmp-pbs032-harness.ts` pre-fix (sec 15-21) and post-fix (sec 31-39).
  Deleted after collection.
- `npx tsc --noEmit` (frontend) — exit 0.
- `npx eslint src/services/rvb-portal.service.ts` — 24 errors post-fix,
  identical 24 pre-fix baseline (legacy `any` debt; delta zero).
- `npm run build` (frontend) — exit 0.
- `npm run test:hsh-sync` (backend) — 34 passed, 0 failed.
- `git diff HEAD --check` — exit 0.

## 31. Post-fix service success

`[pbs032] F-service ok n=2 ids=pbs032-ev-new,pbs032-ev-old orderOk=true hasY=false refresh=0`
Requests `/worker/financial-events`, HTTP 200, 2 X events, zero Y events,
zero refresh on valid token.

## 32. Post-fix data-content proof

`[pbs032] B5-caller result=[{"id":"pbs032-ev-new",…,"type":"salary","amount":1000,"balanceBefore":1200,"balanceAfter":2200,…},{"id":"pbs032-ev-old",…,"type":"bonus","amount":200,"balanceBefore":1000,"balanceAfter":1200,…}]`
Full backend DTO values retained (id, workerId, type, amount, balanceBefore,
balanceAfter, createdAt/updatedAt, note, null actor/reference fields). No
client-side transformation (`return d.events || []` unchanged).

## 33. Ordering proof

`orderOk=true` (`ev-new` before `ev-old` = `createdAt` newest-first as served;
no client reordering — service returns `d.events` as-is).

## 34. Caller result proof

`[pbs032] F-caller n=2` — the exact live pattern
`getWorkerFinancial().catch(() => [])` now returns the 2 real events; the
catch is dormant, policy untouched.

## 35. UI/browser proof

Not performed as a browser render run (disproportionate setup for a
one-token URL fix). Substituted with exact proof: real service + real backend
+ the verbatim caller expression from both live call sites, which feed
`setFinancial` → the panels at page.tsx:425-428/943-946. Explicitly stated:
panel render timing was not separately browser-tested.

## 36. Genuine-empty result

`[pbs032] F-empty n=0` — worker Z via the REAL fixed service returns `[]`
over HTTP 200. Caller empty-state (`t.noData`) remains correct for genuinely
empty histories.

## 37. Worker isolation proof

`hasY=false` in F-service for worker X; supervisor linked to Y receives only
Y's event (B7). Server-side `find({workerId: linkedId})` scoping unchanged
and un-regressed.

## 38. Role regression proof

B7 semantics re-verified post-fix run (same code paths, backend untouched):
supervisor 200, manager 403 `RVB_FORBIDDEN`. No role-rule changes in diff.

## 39. PBS-BUG-028 regression proof

Endpoint line still `rvbAuthService.authFetch` (diff shows only the URL token
changed). F-service `refresh=0` on valid token; B8 pattern (expired access →
401 → one refresh 200 → retry → 200) now succeeds end-to-end post-fix
(`B8 UNEXPECTED-SUCCESS` label is the pre-fix harness's success-branch label
firing because the call now succeeds after the single refresh — i.e. 028
recovery + correct route compose).

## 40. PBS-BUG-029/030 preservation

`isTerminalRvbAuthError` present (service line 67, used line 342);
`RvbAuthContext` terminal-only cleanup present; `restoreSessionFromCookie`
present (service + context line 47). `git diff HEAD --name-only` contains NO
auth files — zero changes to 029/030 behavior.

## 41. PBS-BUG-031 boundary proof

`rvbPortalService.me()` (lines 8-12) byte-identical before/after (single-hunk
diff touches only line 19). 031 dead mismatch untouched.

## 42. PBS-BUG-033 boundary proof

`rvbCustomerService.getOrders()` not in diff scope; no customer-service file
modified. 033 untouched.

## 43. Post-fix route grep

Frontend grep `worker/financial"`: NO files found — no remaining live web
request to the nonexistent endpoint. Grep `/worker/financial` hits only
`rvb-portal.service.ts:19`, which now reads `/worker/financial-events`
(substring match). Historical docs/tests/comments intentionally not edited.

## 44. TypeScript result

`npx tsc --noEmit` in `H.S.H-V2.0.0/frontend`: `TSC_LASTEXIT=0`.

## 45. Lint result

`npx eslint src/services/rvb-portal.service.ts`: 24 errors post-fix vs 24
errors HEAD baseline (all pre-existing `no-explicit-any`; the touched line
introduces no new lint). Delta zero; unrelated debt not fixed.

## 46. Production build result

`npm run build` in `H.S.H-V2.0.0/frontend`: `BUILD_LASTEXIT=0`, all routes
emitted.

## 47. HSH sync-suite result

`npm run test:hsh-sync` in `H.S.H-V2.0.0/backend`:
`=== H.S.H sync integrity: 34 passed, 0 failed ===`.

## 48. git diff/status/check proof

Post-cleanup:
```text
M H.S.H-V2.0.0/frontend/src/services/rvb-portal.service.ts
D TEMP-PBS-BUG-030-AUDIT.md
?? TEMP-PBS-BUG-032-AUDIT.md
```
`git diff HEAD --stat`: portal service `1 insertion(+), 1 deletion(+)` (plus
the required 030-audit deletion). `git diff HEAD --name-only`: only the
portal service + deleted 030 audit. `git diff HEAD --check`: exit 0.

## 49. Disposable-artifact cleanup

Deleted: `TEMP-PBS-BUG-030-AUDIT.md` (previous-cycle artifact),
`H.S.H-V2.0.0/backend/tmp-pbs032-harness.ts` (post-evidence). No
`tmp-pbs030*`/Playwright/config leftovers existed. Kept: this audit + the
one-line production fix.

## 50. Remaining uncertainty

1. No browser render run (sec 35) — panel correctness follows from
   service-data proof + unchanged rendering code, but a logged-in visual pass
   was not executed.
2. `RVB-MOBILE-CONTRACT.md:91` still documents the wrong `/financial` path
   (sec 11) — left stale per cycle preference; flagged for a docs pass.
3. Express 404 body is non-JSON HTML (`body={}` via supertest parse); web
   `handleRes` maps it to `code: undefined, status: 404` — pre-existing
   generic handling, out of scope.

## 51. Final status

FIXED — READY FOR GIORNO REVIEW
