# Poultry Business Suite — Debug Problem Inventory (Re-Audited Baseline)

## Audit information

- **First audit (UTC):** 2026-09-27 — static analysis, PBS-BUG-001…040, 38 CONFIRMED / 2 NEEDS VERIFICATION.
- **Re-audit (UTC):** 2026-09-27 — challenge/verify pass. No application code modified. Only this file changed, plus two disposable diagnostic probes (see Diagnostic Tests).
- **Repository/workspace:** `C:\Users\islam\OneDrive\Desktop\poultry-business-suite`
- **Applications:** `H.S.H-V2.0.0/frontend` (Next.js 16.3.5 + React 19.2.8; Dexie 4.4.5 installed, verified), `H.S.H-V2.0.0/backend` (Express 5.2.1 + Mongoose 9.9.3), `R.V.B-mobile` (Expo SDK ~57 + React Native 0.86.3).
- **Exact dependency versions verified:** Dexie **4.4.5** (`frontend/node_modules/dexie/package.json`), `fake-indexeddb` 6.2.5 (harness for runtime probes). All three `npx tsc --noEmit` PASS (unchanged).
- **Deployment facts established during re-audit:** backend `httpServer.listen(PORT)` with **no host arg** (binds all interfaces by default); CORS allows no-Origin (curl/native) + `CORS_ORIGIN` (default `http://localhost:3000`); `SERVER_MODE=full` (default) mounts `/api/sync|/printing|/invoices`, `rvb-public` 404s them; `server.ts:44-49` warns full mode in production "exposes" those routes and directs public/mobile deployments to `rvb-public`; `express.json({limit:"1mb"})`; login/refresh IP rate limits exist, sync has none. No `<StrictMode>` in `frontend/app/layout.tsx`; `next.config.ts` sets nothing (StrictMode status unconfirmed — impacts PBS-BUG-017 assessment).

## Re-Audit Summary

- **Total IDs reviewed:** 40 (001–040). **New IDs added:** 0.
- **CONFIRMED:** 28
- **NEEDS VERIFICATION:** 3 (016, 039, 040)
- **REJECTED — NOT A BUG:** 4 (001, 003, 031, 033)
- **DESIGN / HARDENING ISSUE:** 4 (006, 011, 020, 021)
- **CONFIRMED — LEGACY-ONLY:** 1 (009)
- **Previous CONFIRMED downgraded:** 001→REJECTED, 003→REJECTED, 031→REJECTED, 033→REJECTED, 006→DESIGN/HARDENING, 011→DESIGN/HARDENING, 016→NEEDS VERIFICATION, 009→LEGACY-ONLY, 020→DESIGN/HARDENING, 021→DESIGN/HARDENING.
- **Fix directions corrected:** 004/005 (NEVER `equals(false/true)` — proven DataError; use filter/status-field), 014 (self-heals next cycle — negligible), 035 (missed codes are `RVB_SESSION_REVOKED` + `RVB_ACCOUNT_ARCHIVED/DISABLED`, not `EXPIRED`), 002 (coupled with 010 — derived rows heal via server canonical changes; stuck-forever only on terminal-failure path), 008 (no silent corruption — spurious conflicts, self-healing).
- **Still requiring live application testing:** 039 (concurrent task creates vs MongoDB), 040 (manager delete-others-message vs live server + product-spec intent), 016 (same-tick form-edit loss in browser), 019 (legacy row without `weightKg`), 022/024/025/026 (sync payload edge cases vs live MongoDB), cross-tab/debounce races (012/013), StrictMode status for 017.

## Diagnostic Tests Performed

| Test | Target Bug(s) | Result | Evidence |
|---|---|---|---|
| Dexie upgrade probe: v1 `{syncOperations}` → v2 `{products}` only (`reaudit-dexie-probe.ts`, tsx + fake-indexeddb, disposable DBs) | 001 | REPRODUCED (premise false) | `tables: ["products","syncOperations"]`, row survives; explicit `null` control deletes table. Matches `dexie.mjs:4090-4108` cumulative `extend(storesSpec, …)` + `: null` deletion check at line 4070 |
| Dexie `table.update` with same PK inside changes | 003 | REPRODUCED (harmless) | No throw, `sameIdCount: 1`, other fields applied (`name: "renamed"`) |
| Dexie `table.update` with different PK inside changes | 003 | Recorded | No throw; record moved `a`→`zzz`. Unreachable in repo (all callers use matching ids) |
| `where("synced").equals(0).count()` on boolean field | 004 | REPRODUCED | Returns `0`, no throw → `.catch` fallback dead |
| `where("synced").equals(false).count()` | 004 fix direction | REPRODUCED (fix invalid) | Throws `DataError: Data provided to an operation does not meet requirements` |
| `where("synced").equals(true).count()` (`reaudit-bool-probe.ts`) | 005 fix direction | REPRODUCED (fix invalid) | Throws same `DataError` |
| `where("synced").equals(1).delete()` | 005 | REPRODUCED | No throw, deletes nothing (`remainingIds` intact); fallback `bulkDelete` does the work |
| `.filter(o => o.synced === true)` control | 004/005 fix direction | PASS | Returns 1 — filter/toArray path is the valid fix direction |
| `tsc --noEmit` ×3 | all (type-level) | PASS | No type errors; all filed bugs are runtime/contract |
| eslint sync/repository files | 010 + hygiene | PASS (confirms) | `hasPendingOperation defined but never used` (apply.ts:58) |
| grep `authFetch` | 028 | CONFIRMED | 2 matches (comment + definition), 0 callers |
| grep route mounts vs callers | 031/032/033/034/037 | CONFIRMED/REJECTED | `getWorkerFinancial` live (page.tsx:361,892); `getOrders`/`portal.me().entity` zero callers; backend directory returns `items`, mobile reads other keys; `canAccess*` zero imports in `app/` |

Probe files (disposable, production data untouched): `H.S.H-V2.0.0/frontend/reaudit-dexie-probe.ts`, `H.S.H-V2.0.0/frontend/reaudit-bool-probe.ts`.

---

## Master Problem Index

| ID | Problem | Section | Primary File | Re-audit Status |
|---|---|---|---|---|
| PBS-BUG-001 | Dexie migration table deletion | Dexie | `H.S.H-V2.0.0/frontend/src/lib/database/db.ts` | REJECTED — NOT A BUG |
| PBS-BUG-002 | Dead ternary keeps `queueSync:false` edits `pending` | Dexie/Repositories | `H.S.H-V2.0.0/frontend/src/repositories/base.repository.ts` | CONFIRMED |
| PBS-BUG-003 | PK `id` inside Dexie `update` changes | Dexie/Repositories | `H.S.H-V2.0.0/frontend/src/repositories/base.repository.ts` | REJECTED — NOT A BUG |
| PBS-BUG-004 | `getPendingSyncCount` always 0 | Sync | `H.S.H-V2.0.0/frontend/src/services/sync/queue.ts` | CONFIRMED |
| PBS-BUG-005 | `deleteSyncedOperations` first delete no-op | Sync | `H.S.H-V2.0.0/frontend/src/services/sync/queue.ts` | CONFIRMED |
| PBS-BUG-006 | `incrementAttemptsAndSetError` demotes `retrying` | Sync | `H.S.H-V2.0.0/frontend/src/services/sync/queue.ts` | DESIGN / HARDENING ISSUE |
| PBS-BUG-007 | Terminal double-increment of `attempts` | Sync | `H.S.H-V2.0.0/frontend/src/services/sync/client.ts` | CONFIRMED |
| PBS-BUG-008 | Per-terminal full bootstrap in result loop | Sync | `H.S.H-V2.0.0/frontend/src/services/sync/client.ts` | CONFIRMED |
| PBS-BUG-009 | Legacy bootstrap drops deletes | Sync | `H.S.H-V2.0.0/frontend/src/services/sync/client.ts` | CONFIRMED — LEGACY-ONLY |
| PBS-BUG-010 | Pull overwrites local pending edits | Sync | `H.S.H-V2.0.0/frontend/src/services/sync/apply.ts` | CONFIRMED |
| PBS-BUG-011 | Cursor jumps over skipped revisions | Sync | `H.S.H-V2.0.0/frontend/src/services/sync/apply.ts` | DESIGN / HARDENING ISSUE |
| PBS-BUG-012 | Cross-tab lock blocks instead of skipping | Sync | `H.S.H-V2.0.0/frontend/src/services/sync/manager.ts` | CONFIRMED |
| PBS-BUG-013 | `triggerSync` unbounded duplicate timers | Sync | `H.S.H-V2.0.0/frontend/src/services/sync/manager.ts` | CONFIRMED |
| PBS-BUG-014 | Pull cursor sticks on empty re-check | Sync | `H.S.H-V2.0.0/frontend/src/services/sync/manager.ts` | CONFIRMED |
| PBS-BUG-015 | `useDbSync` stale closure + churn | Frontend/State | `H.S.H-V2.0.0/frontend/src/hooks/useDbSync.ts` | CONFIRMED |
| PBS-BUG-016 | Stale `setForm({...form})` spread | Frontend/Forms | `H.S.H-V2.0.0/frontend/app/customers/page.tsx` | NEEDS VERIFICATION |
| PBS-BUG-017 | Settings side effect in updater | Settings | `H.S.H-V2.0.0/frontend/app/settings/page.tsx` | CONFIRMED |
| PBS-BUG-018 | Settings first-run never populates state | Settings | `H.S.H-V2.0.0/frontend/app/settings/page.tsx` | CONFIRMED |
| PBS-BUG-019 | Products `weightKg.toFixed` crash | Products | `H.S.H-V2.0.0/frontend/app/products/page.tsx` | CONFIRMED |
| PBS-BUG-020 | Unauthenticated HSH routes | Backend/AuthZ | `H.S.H-V2.0.0/backend/src/routes/sync.ts` | DESIGN / HARDENING ISSUE |
| PBS-BUG-021 | Unbounded sync batch, no rate limit | Backend | `H.S.H-V2.0.0/backend/src/routes/sync.ts` | DESIGN / HARDENING ISSUE |
| PBS-BUG-022 | `weight` alias ignored by handlers | Backend/DB | `H.S.H-V2.0.0/backend/src/sync/sync-service.ts` | CONFIRMED |
| PBS-BUG-023 | Notification channel force + delete leak | Backend/Sync | `H.S.H-V2.0.0/backend/src/sync/sync-service.ts` | CONFIRMED |
| PBS-BUG-024 | `payment.entityType` validation gap | Backend | `H.S.H-V2.0.0/backend/src/sync/sync-service.ts` | CONFIRMED |
| PBS-BUG-025 | Required-field validation gaps | Backend | `H.S.H-V2.0.0/backend/src/sync/sync-service.ts` | CONFIRMED |
| PBS-BUG-026 | `incomingInvoice` alias/currency gap | Backend/DB | `H.S.H-V2.0.0/backend/src/sync/sync-service.ts` | CONFIRMED |
| PBS-BUG-027 | Stale `linkedEntityId` in request routes | Backend/AuthZ | `H.S.H-V2.0.0/backend/src/routes/worker-requests.ts` | CONFIRMED |
| PBS-BUG-028 | `authFetch` dead code | RVB Web/Auth | `H.S.H-V2.0.0/frontend/src/services/rvb-auth.service.ts` | CONFIRMED |
| PBS-BUG-029 | Refresh gated by storage hint | RVB Web/Auth | `H.S.H-V2.0.0/frontend/src/services/rvb-auth.service.ts` | CONFIRMED |
| PBS-BUG-030 | Hint cleared on transient failure | RVB Web/Auth | `H.S.H-V2.0.0/frontend/src/contexts/RvbAuthContext.tsx` | CONFIRMED |
| PBS-BUG-031 | `portal.me()` `entity` vs `linkedEntity` | RVB Web | `H.S.H-V2.0.0/frontend/src/services/rvb-portal.service.ts` | REJECTED — NOT A BUG |
| PBS-BUG-032 | `getWorkerFinancial()` 404 | RVB Web | `H.S.H-V2.0.0/frontend/src/services/rvb-portal.service.ts` | CONFIRMED |
| PBS-BUG-033 | `getOrders(id)` 404 | RVB Web | `H.S.H-V2.0.0/frontend/src/services/rvb-customer.service.ts` | REJECTED — NOT A BUG |
| PBS-BUG-034 | Mobile directory always `[]` | RVB Mobile | `R.V.B-mobile/src/services/directory.service.ts` | CONFIRMED |
| PBS-BUG-035 | Socket re-auth misses codes | RVB Web/Realtime | `H.S.H-V2.0.0/frontend/src/services/chat-socket.service.ts` | CONFIRMED |
| PBS-BUG-036 | SecureStore localStorage fallback | RVB Mobile/Auth | `R.V.B-mobile/src/services/secure-store.ts` | CONFIRMED |
| PBS-BUG-037 | Mobile zero role guards | RVB Mobile/AuthZ | `R.V.B-mobile/app/_layout.tsx` | CONFIRMED |
| PBS-BUG-038 | Purchases double-load; notifications race | Frontend/State | `H.S.H-V2.0.0/frontend/app/purchases/page.tsx` | CONFIRMED |
| PBS-BUG-039 | Task-name race, no DB index | Backend/DB | `H.S.H-V2.0.0/backend/src/sync/sync-service.ts` | NEEDS VERIFICATION |
| PBS-BUG-040 | Chat `isAdmin` excludes manager | Backend/AuthZ | `H.S.H-V2.0.0/backend/src/routes/chats.ts` | NEEDS VERIFICATION |

Cross-ID relationships: PBS-BUG-005 SAME ROOT CAUSE AS PBS-BUG-004 (boolean-index confusion). PBS-BUG-030 amplifies PBS-BUG-029 (hint lifecycle). PBS-BUG-015 amplifies PBS-BUG-038. PBS-BUG-002 coupled with PBS-BUG-010 (derived-row lifecycle; see 002). PBS-BUG-007/008 share the terminal branch (different causes).

---

## PBS-BUG-001 — Dexie v2–v5 migrations delete tables

### Re-audit status
REJECTED — NOT A BUG

### Previous status
CONFIRMED

### Re-audit result
Original conclusion overturned by installed-source semantics plus runtime reproduction. Dexie 4.4.5 `Version.prototype.stores()` merges every version's declaration cumulatively; a table omitted from a later version is inherited, not deleted. Deletion requires explicit `tableName: null`.

### Exact file
`H.S.H-V2.0.0/frontend/src/lib/database/db.ts`

### Exact function/component
`HebrihDatabase.constructor`, versions 1–10 (lines 88–266).

### What the code actually does
Declares partial per-version schemas (v2 omits sync tables, v3–v5 omit business tables, v6+ re-declare the full set). Under Dexie 4.4.5 this is redundant but harmless: final schema = union of all versions.

### Why this is not a bug
`node_modules/dexie/dist/dexie.mjs:4090-4108` — `stores()` does `extend(this._cfg.storesSource, stores)` then replays `extend(storesSpec, version._cfg.storesSource)` over ALL versions; `_parseStoresSpec` (line 4070) only treats `stores[tableName] === null` as removal. Runtime probe: v1 `{syncOperations}` + data, then v2 `{products}` only → both tables present, row intact (`tables: ["products","syncOperations"]`); explicit-`null` control deletes. The v7 code comment claiming an old deletion bug reflects the same false premise, not an observed data loss.

### Evidence
- `dexie.mjs:4070`: `if (stores[tableName] !== null) { … }`
- `dexie.mjs:4092-4102`: cumulative `extend` across `db._versions`
- Probe `reaudit-dexie-probe.ts`: `PASS: 001-omitted-table-survives-upgrade`, `PASS: 001-data-in-omitted-table-survives`, `PASS: 001-explicit-null-deletes-table`

### Runtime reproduction
REPRODUCED (premise disproven — omission is safe).

### Actual impact
None. No data loss on any upgrade path. Fresh and aged profiles converge on the same union schema.

### Correct future fix direction
None required. Optionally collapse redundant version blocks for readability — cosmetic only, not scheduled.

### Verification required during future fixing
N/A (rejected).

---

## PBS-BUG-002 — `BaseRepository.update` dead ternary keeps `queueSync:false` edits `pending`

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives. Dead ternary is literal (`queueSync ? "pending" : "pending"`, line 100); `queueSync:false` + `.update()` is heavily used for derived balance writes (payment/purchase/sale/transfer operations, 40+ call sites). Impact statement corrected: coupled with PBS-BUG-010.

### Exact file
`H.S.H-V2.0.0/frontend/src/repositories/base.repository.ts`

### Exact function/component
`BaseRepository.update`, line 100 (same pattern in `create`, lines 73–78).

### What the code actually does
Both branches write `syncStatus:"pending"`; the `!queueSync` path skips `coalescePendingOperations`, so derived rows carry `pending` with no outbox row. Code comment states intent: "server will canonicalize via authoritative transaction".

### Why this is a bug
The `queueSync` flag has no observable effect on status, so the two paths are indistinguishable downstream (`applySnapshot` pending-set treats these rows as unpushed locals). Stuck-forever path is real but narrower than first stated: normally the server emits canonical `SyncChange`s for touched derived entities (products/customers/suppliers/bankAccounts — sync-service emits them after every business handler), and pull overwrites the derived rows back to `synced` (precisely because PBS-BUG-010 has no pending guard). Permanent `pending` occurs when the authoritative op fails terminally and a later snapshot then *protects* the derived row via pending-set. NEEDS PRODUCT SPEC: intended terminal state of derived writes was never specified; do not assume `synced` is correct either.

### Evidence
```ts
const mergedChanges: any = { ...changes, updatedAt: now, syncStatus: queueSync ? "pending" : "pending" };
```
Callers: `payment.operation.ts:59-63` (`supplierRepository.update(…, {queueSync:false})`), plus purchase/sale/transfer/edit/reversal operations. Server canonical emissions: `sync-service.ts:328,334,359,365` (`SyncChange … entity: product|customer|supplier` after handlers).

### Runtime reproduction
STATICALLY PROVEN (deterministic dead branch + traced callers). NOT YET TESTED live (needs payment flow + terminal-failure injection).

### Actual impact
Misleading sync badges on derived rows; permanently-pending rows only when the authoritative op goes terminal. Normal-path rows self-heal on next pull via server canonical changes.

### Correct future fix direction
Specify derived-write lifecycle first (product spec), then make branches distinct AND keep consistent with the PBS-BUG-010 guard decision — strongly coupled: when fixing either ID, the related ID must be regression-tested. One PBS-BUG ID per debugging cycle; a fix here must not silently modify PBS-BUG-010 behavior without explicit review.

### Verification required during future fixing
1. Payment with `queueSync:false` derived writes → push succeeds → pull → derived rows `synced`. 2. Force terminal failure of authoritative op → snapshot → derived rows reach a specified terminal state (not stuck `pending` with zero outbox rows).

---

## PBS-BUG-003 — Remote update/upsert writes PK `id` inside Dexie `update` changes

### Re-audit status
REJECTED — NOT A BUG

### Previous status
CONFIRMED

### Re-audit result
Overturned by runtime test against Dexie 4.4.5. `table.update(key, {id: sameKey, …})` does not throw and applies other fields (`sameIdCount: 1`). The only reachable usage passes identical ids.

### Exact file
`H.S.H-V2.0.0/frontend/src/repositories/base.repository.ts`

### Exact function/component
`applyRemoteUpdate` (lines 217–224), `upsert` (lines 230–237).

### What the code actually does
Spreads full entity (including `id`) into `update` changes. Probe with different id moved the record without throwing; same-id (the only in-repo case) is a harmless no-op on the key.

### Why this is not a bug
Every in-repo caller uses matching ids (`applyRemoteUpdate(id, entity)` where `entity.id === id`; `upsert` uses `entity.id` as key). Proven harmless under installed Dexie. At most a hygiene note (strip `id` defensively), not a defect.

### Evidence
Probe: `sameIdThrew: null`, `afterSame.name: "renamed"`, `sameIdCount: 1`. Different-id: `diffIdThrew: null`, record relocated — unreachable in repo code.

### Runtime reproduction
REPRODUCED (harmless — no failure under exact project usage).

### Actual impact
None.

### Correct future fix direction
None required.

### Verification required during future fixing
N/A (rejected).

---

## PBS-BUG-004 — `getPendingSyncCount` queries boolean `synced` with `equals(0)`, always 0

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives; original diagnosis of the *bug* confirmed by runtime test (`equals(0)` → `0`, no throw, fallback dead). Original *fix direction* (`equals(false)`) REFUTED — it throws `DataError`.

### Exact file
`H.S.H-V2.0.0/frontend/src/services/sync/queue.ts`

### Exact function/component
`getPendingSyncCount`, lines 476–480.

### What the code actually does
`db.syncOperations.where("synced").equals(0 as any).count()` resolves `0` without throwing, so `.catch()` fallback never executes. Note `synced` IS indexed (db.ts syncOperations index list includes it), but boolean is not a valid IndexedDB key.

### Why this is a bug
Deterministic wrong result: any consumer of the queue-module counter sees 0 pending forever. (Manager-module `getPendingSyncCount` uses `getPendingSyncOperations().length` and is correct — impact limited to importers of the queue helper.)

### Evidence
Probe: `eq0: 0` (no throw); `equals(false)` → `THREW: DataError…`; `.filter()` control → correct count 1. SAME ROOT CAUSE AS PBS-BUG-005.

### Runtime reproduction
REPRODUCED.

### Actual impact
Stale pending-count UI/state for queue-helper consumers. No data loss.

### Correct future fix direction
Do NOT use `equals(false/true)` (proven to throw). Use `.filter()`/`toArray` filtering, the string `status` field, or migrate persisted representation to `0/1`. Do not apply now.

### Verification required during future fixing
Queue 2 ops → counter returns 2; sync → returns 0; no `DataError` in console.

---

## PBS-BUG-005 — `deleteSyncedOperations` first delete targets `equals(1)`, never matches

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives as a performance-only defect. Probe: `equals(1).delete()` — no throw, deletes nothing; full-scan fallback does the real work. SAME ROOT CAUSE AS PBS-BUG-004.

### Exact file
`H.S.H-V2.0.0/frontend/src/services/sync/queue.ts`

### Exact function/component
`deleteSyncedOperations`, lines 458–464.

### What the code actually does
Indexed delete matches zero rows (numeric `1` vs boolean `true`); `toArray` + `bulkDelete` fallback deletes correctly.

### Why this is a bug
Deterministic dead query on every sync cycle (`client.ts:284` calls it after each push) plus a full table scan. Correctness preserved by fallback — performance impact only. Separated per §15 (no corruption claim).

### Evidence
Probe: `eq1del: "no-throw"`, `remainingIds` intact after `equals(1).delete()`; `equals(true)` throws (bool probe) so it is not a valid replacement either.

### Runtime reproduction
REPRODUCED.

### Actual impact
One wasted indexed query + one full `syncOperations` scan per sync cycle. No data loss.

### Correct future fix direction
Same as 004: filter-based deletion or `0/1` representation or status-field query. Do not apply now.

### Verification required during future fixing
Mark ops synced → `deleteSyncedOperations()` removes them in one pass; no full-scan fallback needed.

---

## PBS-BUG-006 — `incrementAttemptsAndSetError` demotes `retrying` to `pending`

### Re-audit status
DESIGN / HARDENING ISSUE

### Previous status
CONFIRMED

### Re-audit result
Downgraded on reachability (§1B): no in-repo caller passes `terminal=false`. `client.ts:136` calls with `true`; `queue.ts:455` (`markTerminal`) calls with `true`; the retryable path in `client.ts:138-142` deliberately avoids this helper (comment at line 140). The corrupting transition therefore never fires in production.

### Exact file
`H.S.H-V2.0.0/frontend/src/services/sync/queue.ts`

### Exact function/component
`incrementAttemptsAndSetError`, lines 439–452 (`status: terminal ? "terminal" : "pending"`).

### What the code actually does
Unconditionally maps non-terminal bookkeeping to `"pending"`, which would destroy the `retrying` immutability invariant if ever called that way.

### Why this is not a confirmed bug
Latent API hazard, not a live defect: the false-path is currently unreachable, and the one place that could hit it explicitly routes around it. Fixing the helper in isolation has zero observable effect today.

### Evidence
Caller grep: only `client.ts:136 (true)` and `queue.ts:455 (true)`; avoidance comment `client.ts:140`.

### Runtime reproduction
NOT REPRODUCED (unreachable path; not executed live).

### Actual impact
None today. Future callers passing `false` would silently break successor protection.

### Correct future fix direction
Preserve prior status when non-terminal (or remove the non-terminal path) when the queue module is next touched. Not scheduled.

### Verification required during future fixing
Put op in `retrying` → record non-terminal error → status stays `retrying`, `attempts+1`.

---

## PBS-BUG-007 — Terminal failure path increments `attempts` twice

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives unchanged. Both increments execute on every terminal rejection in the same branch.

### Exact file
`H.S.H-V2.0.0/frontend/src/services/sync/client.ts`

### Exact function/component
`syncPendingOperations` terminal branch, lines 125–137; helper `revertInFlightToTerminalAndRebaseSuccessors` (`queue.ts:377`, `attempts+1`).

### What the code actually does
Helper marks terminal (`attempts+1`), then `incrementAttemptsAndSetError(match.id, …, true)` adds `+1` again.

### Why this is a bug
Deterministic double-count on every terminal rejection; any attempts-based threshold/pruning fires early.

### Evidence
```ts
await revertInFlightToTerminalAndRebaseSuccessors(operationId, r.error ?? r.message, currentRev); // +1 inside
if (match?.id !== undefined) { try { await incrementAttemptsAndSetError(match.id, r.error ?? r.message, true); } catch {} } // +1 again
```

### Runtime reproduction
STATICALLY PROVEN (both statements unconditional in-branch). NOT YET TESTED live.

### Actual impact
Inflated counters only; no data loss. Shares branch with PBS-BUG-008 (strongly coupled — when fixing either ID, the related ID must be regression-tested; one ID per debugging cycle).

### Correct future fix direction
Single increment on the terminal path.

### Verification required during future fixing
Force one terminal rejection → `attempts` increases by exactly 1.

---

## PBS-BUG-008 — Per-terminal full `fetchBootstrap`+`applySnapshot` inside result loop

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives with corrected impact: N× full snapshot + reconcile per batch is deterministic; "stale rebase" does NOT cause silent corruption — successors rebased to the pre-snapshot revision get rejected as stale on next push (`checkStaleCrossClient`, sync-service.ts:295-301) and flow through the terminal/conflict path (spurious `CONFLICT_STALE_REVISION` churn, self-healing, not silent loss).

### Exact file
`H.S.H-V2.0.0/frontend/src/services/sync/client.ts`

### Exact function/component
`syncPendingOperations`, lines 125–196 (fetch at 181–183; revision read at 130).

### What the code actually does
Each terminal business/update/delete result triggers its own `GET /api/sync/bootstrap` + full `applySnapshot` reconcile, then deletes the terminal op.

### Why this is a bug
Deterministic N× bandwidth + N× full IndexedDB reconciliations per batch; plus stale-`baseRevision` successors causing avoidable conflict churn.

### Evidence
Loop-contained `fetchBootstrap`/`applySnapshot` (quoted in first audit); server stale rule `sync-service.ts:298-300`.

### Runtime reproduction
STATICALLY PROVEN. NOT YET TESTED live (needs multi-terminal batch).

### Actual impact
Performance + spurious conflict records. No silent data corruption (correction recorded).

### Correct future fix direction
Collect terminals, reconcile once post-loop, rebase against final revision. With PBS-BUG-007.

### Verification required during future fixing
Batch with 3 terminals → exactly 1 bootstrap fetch; successors carry post-snapshot revision; no spurious conflicts.

---

## PBS-BUG-009 — Legacy bootstrap fallback drops `delete` operations

### Re-audit status
CONFIRMED — LEGACY-ONLY

### Previous status
CONFIRMED

### Re-audit result
Reclassified: current backend `GET /api/sync/bootstrap` returns `{snapshot}` (routes/sync.ts), so the lossy `changes→snapshot` conversion only executes against obsolete servers. Mechanism itself is real (`ch.operation !== "delete"` filter, client.ts:317-319).

### Exact file
`H.S.H-V2.0.0/frontend/src/services/sync/client.ts`

### Exact function/component
`fetchBootstrap`, lines 307–324.

### What the code actually does
Converts legacy `{changes}` shape to snapshot, discarding deletes; ghosts survive.

### Why this is a (legacy-only) bug
Deterministic data divergence, but only against servers predating the snapshot bootstrap. Current architecture unaffected.

### Evidence
Filter line quoted in first audit; current server shape `{snapshot}` (routes/sync.ts:98+).

### Runtime reproduction
NOT YET TESTED (needs legacy-shape server mock).

### Actual impact
None on current deployments. Interop hazard only.

### Correct future fix direction
Route legacy changes through `applyBootstrapChanges` (delete-aware) if legacy interop is ever required.

### Verification required during future fixing
Mock legacy bootstrap containing a delete → local record removed.

---

## PBS-BUG-010 — `applyRemoteChanges` overwrites local pending edits; helper dead

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives. `applySnapshot` guards via pending-set (apply.ts:218-258); `applyRemoteChanges` (lines 63–105) has no guard; `hasPendingOperation` (lines 58–61) confirmed zero callers by eslint. Reachable every pull with concurrent local edits. Coupled with PBS-BUG-002 (derived-row healing depends on this overwrite — strongly coupled: when fixing either ID, the related ID must be regression-tested; one ID per debugging cycle).

### Exact file
`H.S.H-V2.0.0/frontend/src/services/sync/apply.ts`

### Exact function/component
`applyRemoteChanges`, lines 63–105; dead `hasPendingOperation`, lines 58–61.

### What the code actually does
Unconditional `table.put(toStore)` per change; outbox rows untouched, so next push re-applies local intent (last-writer-wins across cycles, UI flicker in between).

### Why this is a bug
Incremental pull can visibly revert the user's just-made offline edit until the next push; with PBS-BUG-002's derived rows this overwrite is currently load-bearing (see 002).

### Evidence
ESLint `no-unused-vars` on `hasPendingOperation`; missing `pendingSet` check vs `applySnapshot:255`.

### Runtime reproduction
STATICALLY PROVEN. NOT YET TESTED live (needs offline-edit + concurrent server change).

### Actual impact
Transient UI regression of optimistic edits; outbox intent preserved (no silent loss).

### Correct future fix direction
Honor pending/business-derived-key protection here AND redefine the PBS-BUG-002 lifecycle in the same change.

### Verification required during future fixing
Pending local edit + server change for same record → optimistic state preserved per spec, outbox intact.

---

## PBS-BUG-011 — Cursor advances past skipped payload-less revisions

### Re-audit status
DESIGN / HARDENING ISSUE

### Previous status
CONFIRMED

### Re-audit result
Downgraded on reachability: current server always records `payload: canonical` for create/update (sync-service.ts:1767, 1889) and `payload: undefined` only for deletes (line 2263), which `applyRemoteChanges` handles before the payload check (apply.ts:85-86). The skip branch therefore cannot fire against the current server.

### Exact file
`H.S.H-V2.0.0/frontend/src/services/sync/apply.ts`

### Exact function/component
`applyRemoteChanges`, lines 89 (`continue`) and 100 (`setServerRevision(maxRevision)`).

### What the code actually does
Skips payload-less non-delete entries but still persists batch-max cursor.

### Why this is hardening, not a live bug
Defensive cursor hygiene for faulty/legacy servers only. No current-server trigger exists.

### Evidence
Server payload guarantees cited above; client branch order (delete-first).

### Runtime reproduction
NOT REPRODUCED (no trigger against current server).

### Actual impact
None today.

### Correct future fix direction
Persist max-applied (not max-seen) revision when this area is next touched.

### Verification required during future fixing
Inject payload-less change → cursor does not jump past it (or loud failure).

---

## PBS-BUG-012 — `withCrossTabLock` blocks on `navigator.locks` instead of skipping

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives with separated impact (§15): UX/latency only — no corruption path (queued lock holders run the same idempotent cycle serially).

### Exact file
`H.S.H-V2.0.0/frontend/src/services/sync/manager.ts`

### Exact function/component
`withCrossTabLock`, lines 229–237.

### What the code actually does
`nav.locks.request("hebrih-hsh-sync", …)` without `ifAvailable:true` queues second tabs behind the first tab's full push+pull; the IndexedDB-lease fallback skips instead.

### Why this is a bug
Deterministic semantic inconsistency between the two lock paths; second tab's sync UI stalls behind network-bound work.

### Evidence
Quoted in first audit; `navigator.locks` queuing semantics are standard API behavior.

### Runtime reproduction
STATICALLY PROVEN. NOT YET TESTED live (needs two-tab harness).

### Actual impact
Multi-tab sync latency stacking. No data corruption (correction recorded).

### Correct future fix direction
`ifAvailable:true` + return `false` when held, mirroring fallback.

### Verification required during future fixing
Two tabs, concurrent triggers → second skips, no queue pile-up.

---

## PBS-BUG-013 — `triggerSync` schedules unbounded duplicate cycles

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives with separated impact: duplicate push/pull traffic only (`syncCycle` dedupes running cycles; queued timers each fire full cycles sequentially — idempotent but wasteful).

### Exact file
`H.S.H-V2.0.0/frontend/src/services/sync/manager.ts`

### Exact function/component
`triggerSync`, lines 327–332.

### What the code actually does
Bare `setTimeout(syncCycle, 500)` per mutation; every repository write schedules one.

### Why this is a bug
Deterministic timer pile-up after write bursts; amplifies PBS-BUG-012 contention.

### Evidence
```ts
export function triggerSync(): void { setTimeout(() => { syncCycle().catch(() => {}); }, 500); }
```

### Runtime reproduction
STATICALLY PROVEN. NOT YET TESTED live.

### Actual impact
Duplicate sync traffic. No corruption (correction recorded).

### Correct future fix direction
Module-level timer handle with `clearTimeout` debounce.

### Verification required during future fixing
10 rapid writes → exactly 1 deferred sync.

---

## PBS-BUG-014 — Pull cursor can stick on empty mid-pull re-check

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives with sharply reduced impact (correction): the cursor does NOT stay stuck across cycles. Next 20 s cycle re-fetches from the old cursor, receives the arrived changes, applies them and converges. The defect wastes exactly one empty round-trip per occurrence.

### Exact file
`H.S.H-V2.0.0/frontend/src/services/sync/manager.ts`

### Exact function/component
`pullPhase`, lines 111–118 (vs persisting branch 94–100).

### What the code actually does
When `currentRevision > after` with `hasMore=false`, re-checks; empty re-check sets `hasMore=false` without persisting `check.currentRevision`.

### Why this is a bug (minor)
Missed persist on one path; self-heals next cycle by design of cursor-based pulls.

### Evidence
Branch quoted in first audit; convergence follows from `fetchRemoteChanges(after)` semantics.

### Runtime reproduction
STATICALLY PROVEN. NOT YET TESTED live.

### Actual impact
One redundant empty pull per mid-pull arrival. Negligible (correction recorded).

### Correct future fix direction
Persist `check.currentRevision` on the empty re-check path.

### Verification required during future fixing
Simulate mid-pull arrival with empty follow-up → stored revision converges immediately.

---

## PBS-BUG-015 — `useDbSync` omits `callback` from deps

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives with narrowed mechanism: with param deps (`[filter,search]`, `[selectedDate]`) the effect re-subscribes on change so staleness window is one render; the certain defect is listener churn (teardown/re-register per keystroke) plus the `eslint-disable` masking.

### Exact file
`H.S.H-V2.0.0/frontend/src/hooks/useDbSync.ts`

### Exact function/component
`useDbSync`, lines 5–18.

### What the code actually does
Captures per-render `callback` closure; subscribes under caller-supplied `deps` with exhaustive-deps disabled.

### Why this is a bug
Per-keystroke listener churn is deterministic for notifications search; stale one-render window is real for fast sync events after param change.

### Evidence
Hook source quoted in first audit; consumers pass `[filter, search]` / date deps.

### Runtime reproduction
STATICALLY PROVEN. NOT YET TESTED live.

### Actual impact
Listener churn + narrow stale-refresh window. Amplifies PBS-BUG-038.

### Correct future fix direction
Ref-mirror callback, subscribe once.

### Verification required during future fixing
Change param → fire `hebrih-db-synced` → current-param reload, single listener.

---

## PBS-BUG-016 — Stale `setForm({...form})` spread loses concurrent edits

### Re-audit status
NEEDS VERIFICATION

### Previous status
CONFIRMED

### Re-audit result
Downgraded: mechanism is real React behavior but the trigger requires two `setForm` calls in the same tick without an intervening render. Each `onChange` here issues exactly one `setForm` per discrete event, and React re-renders between keystrokes, so the loss precondition (same-tick batching: autofill, programmatic double-set, concurrent handlers) was not demonstrated in-app.

### Exact file
`H.S.H-V2.0.0/frontend/app/customers/page.tsx` (plus suppliers/workers/vehicles/tasks as listed in first audit)

### Exact function/component
Field `onChange` handlers (e.g. customers ~lines 962–1155).

### What the code actually does
`setForm({ ...form, field })` over render-time closure; products page uses the functional form (reference).

### Why verification is still needed
Code pattern is fragile per React docs, but no same-tick double-update path was traced in these forms. Do not present as a certain user-facing defect until reproduced.

### Evidence
Stale vs functional patterns quoted in first audit; no traced same-tick trigger.

### Runtime reproduction
NOT YET TESTED (needs browser test: rapid/autofill entry asserting both fields persist).

### Actual impact
Unknown until reproduced; at most same-tick edit loss.

### Correct future fix direction
Functional updates (only if reproduced or as opportunistic hardening during form work).

### Verification required during future fixing
Drive two fields in the same tick (testing-library `fireEvent` batch or autofill) → both persist → save → stored record complete.

---

## PBS-BUG-017 — Settings write + event dispatch inside `setSettings` updater

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives with conditional impact: updater impurity is a deterministic React-contract violation, but double-invocation (hence double save/event) occurs only under StrictMode, whose status is UNCONFIRMED (no `<StrictMode>` in layout, `next.config.ts` empty).

### Exact file
`H.S.H-V2.0.0/frontend/app/settings/page.tsx`

### Exact function/component
`updateSettingsPartial`, lines 632–647.

### What the code actually does
Calls `settingsService.save(next).then(dispatch SETTINGS_EVENT)` inside `setSettings(prev => …)`.

### Why this is a bug
Side effects inside updaters are forbidden regardless of mode; under StrictMode they double-fire deterministically.

### Evidence
Updater source quoted in first audit; StrictMode status checked and unconfirmed (see Audit information).

### Runtime reproduction
STATICALLY PROVEN (contract violation). Double-fire NOT YET TESTED (needs StrictMode determination + render test).

### Actual impact
Certain: impure updater. Conditional: duplicate writes/events only if StrictMode active.

### Correct future fix direction
Compute `next` outside updater; `setSettings(next)` + save + dispatch sequentially.

### Verification required during future fixing
1. Determine StrictMode status. 2. Toggle setting → exactly 1 write + 1 event in both modes.

---

## PBS-BUG-018 — Settings first-run saves defaults but never populates state

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives unchanged. `else` branch saves without `setSettings`/`setLanguage` — deterministic first-run blank UI.

### Exact file
`H.S.H-V2.0.0/frontend/app/settings/page.tsx`

### Exact function/component
`loadSettings`, lines 540–554.

### What the code actually does
`else { await settingsService.save(DEFAULT_SETTINGS); }` and returns; UI keeps constructor initial until next event/reload.

### Why this is a bug
Deterministic missing state assignment on exactly one path.

### Evidence
Branch quoted in first audit.

### Runtime reproduction
STATICALLY PROVEN. NOT YET TESTED live (needs cleared IndexedDB).

### Actual impact
First-run settings display only; persisted data correct.

### Correct future fix direction
Set state from defaults on the `else` path.

### Verification required during future fixing
Clear IndexedDB → open Settings → defaults displayed immediately.

---

## PBS-BUG-019 — Products list crashes on legacy `weightKg === undefined`

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives with narrowed precondition: `Product.weightKg` is required by type and all current writers set it, so the crash needs a pre-field/seed row. Crash mechanism itself is deterministic (`undefined.toFixed` throws, breaking the whole list render), and the page's own aggregates prove the author encountered missing weights.

### Exact file
`H.S.H-V2.0.0/frontend/app/products/page.tsx`

### Exact function/component
Row weight cell, line 732.

### What the code actually does
`{product.weightKg.toFixed(2)}` unguarded; aggregates use `(Number(p.weightKg)||0)`.

### Why this is a bug
One legacy row breaks the entire page render; fix is trivial and safe.

### Evidence
Crash line vs safe aggregate quoted in first audit; type requires `weightKg: number` (so only legacy/seed rows trigger).

### Runtime reproduction
STATICALLY PROVEN (mechanism). Precondition NOT YET TESTED (needs row without `weightKg`).

### Actual impact
Full products-page render failure when any legacy row lacks `weightKg`.

### Correct future fix direction
`(Number(product.weightKg) || 0).toFixed(2)`.

### Verification required during future fixing
Insert legacy row without `weightKg` → page renders `0.00`, no crash.

---

## PBS-BUG-020 — HSH backend routes have no auth

### Re-audit status
DESIGN / HARDENING ISSUE

### Previous status
CONFIRMED

### Re-audit result
Downgraded per §3/§14 (NEEDS PRODUCT SPEC + deployment context). The repo establishes a trust model: default `SERVER_MODE=full` mounts the routes; `rvb-public` 404s them; `server.ts:44-49` warns that full-in-production "exposes" them and directs public/mobile deployments to `rvb-public`. Unauthenticated HSH sync is therefore plausibly intentional local-trust design (single-user desktop + LAN), not an established defect. Exploitability is deployment-dependent: `listen(PORT)` with no host binds all interfaces, so a full-mode server on a hostile network IS exposed — but whether that deployment is supported is unspecified.

### Exact file
`H.S.H-V2.0.0/backend/src/routes/sync.ts` (plus `printing.ts`, `invoice.ts`; mounts `server.ts:97-106`)

### Exact function/component
`router.post("/")`, `router.get("/changes|/bootstrap|/status")`.

### What the code actually does
Accepts unauthenticated sync/printing/invoice traffic in full mode; frontend sync client sends no auth headers (consistent with the local-trust reading).

### Why this is hardening, not a confirmed bug
No product spec requires RVB auth on HSH routes; the codebase documents the mode split and warns operators. Calling it a vulnerability presumes a threat model the repo does not establish.

### Evidence
`server.ts:44-49` warning text; mode-gated mounts `97-106`; `listen(PORT)` no-host bind; CORS no-Origin allowance (native/curl); zero `requireRvbAuth` in the three routers vs all RVB routers.

### Runtime reproduction
NOT YET TESTED (no live server probed; static mount trace only).

### Actual impact
Deployment-dependent: localhost/trusted-LAN = by design; full-mode on public network = full DB read/write exposure. Must not be overstated (correction recorded).

### Correct future fix direction
Settle deployment intent first (product spec): bind-address default, pairing secret, or auth requirement for full mode; keep `rvb-public` behavior for public deployments.

### Verification required during future fixing
1. Unauthenticated sync from untrusted network rejected (or documented as trusted-local only with bind guard). 2. Normal local sync unaffected.

---

## PBS-BUG-021 — `POST /api/sync` unbounded batch, no rate limit

### Re-audit status
DESIGN / HARDENING ISSUE

### Previous status
CONFIRMED

### Re-audit result
Downgraded: bounded in practice by `express.json({limit:"1mb"})` (~hundreds of small ops, not unlimited), sequential per-op transactions are an availability concern contingent on the PBS-BUG-020 deployment question. No corruption path (each op is transactional).

### Exact file
`H.S.H-V2.0.0/backend/src/routes/sync.ts`

### Exact function/component
`router.post("/")`, lines 9–30; `processSyncOperations` loop (sync-service.ts:2353+).

### What the code actually does
Validates envelope shape only; processes ops sequentially, each in its own transaction; no route rate limiter (login/refresh/chats have them).

### Why this is hardening, not a confirmed bug
Throughput/DoS hardening recommendation; no demonstrated failure and no corruption mechanism. Client already batches at 100.

### Evidence
Envelope checks quoted in first audit; `server.ts:84` 1 MB cap; `server.ts:92-93` existing limiters as reference pattern.

### Runtime reproduction
NOT YET TESTED (no load test executed).

### Actual impact
Large batches slow the server linearly; contention only. No data corruption (correction recorded).

### Correct future fix direction
Cap batch length (align 100), add rate limiting consistent with other routes, only after settling 020's deployment intent.

### Verification required during future fixing
Oversized batch → 413/429; normal 100-op batch unaffected.

---

## PBS-BUG-022 — `weight` alias validated but ignored by handlers (NaN stock)

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives, re-verified line-exact. Validation (line 201) and generic aggregator (line 469/1010) accept `weight`; authoritative `handleSaleCreate` (line 313) / `handlePurchaseCreate` (line 349) read only `it.weightKg` → `Number(undefined)` = NaN → `prod.weightKg < NaN === false` bypasses stock check (sale) → `$inc: {weightKg: -NaN}` (both).

### Exact file
`H.S.H-V2.0.0/backend/src/sync/sync-service.ts`

### Exact function/component
`validatePurchaseSalePayload` line 201; `handleSaleCreate` lines 308–324; `handlePurchaseCreate` lines 344–360.

### What the code actually does
Accepts legacy `weight`, then aggregates `Number(it.weightKg)` → NaN downstream.

### Why this is a bug
Deterministic validation/business split: alias passes the gate, corrupts the ledger. Reachable only via legacy/direct callers (frontend types use `weightKg` only) — scope narrowed, mechanism certain.

### Evidence
```ts
const weightRaw = it.weightKg !== undefined ? it.weightKg : it.weight; // 201
cur.weight += Number(it.weightKg); // 313, 349 → NaN when alias used
if (prod.weightKg < need.weight) return "INSUFFICIENT_STOCK"; // NaN comparison false → bypass
```

### Runtime reproduction
STATICALLY PROVEN. NOT YET TESTED live (needs sync POST with `weight`-only items vs MongoDB).

### Actual impact
Legacy-path stock bypass + `$inc: NaN` write (error or corruption depending on driver). Web UI unaffected.

### Correct future fix direction
Normalize `weight → weightKg` once at ingress before validation and handlers.

### Verification required during future fixing
`weight`-only items → correct stock decrement; insufficient stock still enforced; no NaN writes.

---

## PBS-BUG-023 — Sync forces `notification.channel = "hsh"`; deletes leak across channels

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives, mechanism re-verified line-exact and split into two independently-proven halves: (a) hijack — channel forcing at ingress (lines 1417–1420) runs for ALL ops, upsert-existing looks up by `{id}` only (line 1807, no channel guard) and `$set`s the forced payload (lines 1865–1874); (b) leak — deletes are recorded with `payload: undefined` (line 2263), so the changes-feed filter (lines 2380–2395, whose own comment admits keeping payload-less deletes) cannot exclude RVB deletes.

### Exact file
`H.S.H-V2.0.0/backend/src/sync/sync-service.ts`

### Exact function/component
Ingress normalization lines 1410–1420; upsert-existing lines 1807/1865–1874; delete recording line 2263; `getChangesAfter` filter lines 2380–2395.

### What the code actually does
Overwrites channel instead of rejecting cross-channel targets; emits unfilterable delete markers into the shared HSH feed.

### Why this is a bug
Deterministic cross-channel mutation + metadata leak (revision/entity/entityId of RVB deletes visible to HSH pollers). Reachability gated by PBS-BUG-020's deployment question for unauthenticated callers, but authenticated HSH clients can also hit it.

### Evidence
```ts
if (!p.channel || p.channel !== "hsh") p.channel = "hsh"; // 1419, all ops
const existingUpsert = await (model as any).findOne({ id: operation.entityId }) // 1807, no channel
payload: undefined, // 2263, deletes
```

### Runtime reproduction
STATICALLY PROVEN. NOT YET TESTED live (needs RVB notification fixture + HSH op).

### Actual impact
RVB notification content mutable via HSH path; RVB delete metadata leaks to HSH feed. No HSH-data corruption.

### Correct future fix direction
Reject HSH ops targeting non-`hsh` docs; tag deletes with channel or split streams.

### Verification required during future fixing
HSH update of RVB id rejected; `GET /changes` carries zero RVB revisions including deletes; HSH notification sync intact.

---

## PBS-BUG-024 — `payment.entityType` not required at validation

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives, re-verified line-exact (lines 959–978): create/upsert requires amount/date/entityId/accountId, checks `entityType` only if provided. Downstream dual codes confirmed by handler + schema (`entityType` required, enum). Impact narrowed: error-contract stability + schema-field disclosure, not corruption (handler rejects before writing).

### Exact file
`H.S.H-V2.0.0/backend/src/sync/sync-service.ts`

### Exact function/component
`validateHshPayload` payment branch, lines 952–980.

### What the code actually does
Lets missing `entityType` through validation; `handlePaymentCreate` / Mongoose reject later with different messages.

### Why this is a bug
Same omission yields different codes per path — unstable contract for sync clients; raw Mongoose text leaks field requirements.

### Evidence
Required-list (960–963) omits `entityType`; if-provided check (975–978); model requires enum `supplier|customer|worker|expense`.

### Runtime reproduction
STATICALLY PROVEN. NOT YET TESTED live.

### Actual impact
Client-visible error instability + minor info disclosure. No write occurs.

### Correct future fix direction
Require enum-checked `entityType` at validation for create/upsert.

### Verification required during future fixing
Missing `entityType` → one stable code; valid payments unaffected.

---

## PBS-BUG-025 — Generic entities skip required-field validation

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives, re-verified line-exact (product 1007–1026, customer/supplier 1027–1035, bankAccount 1036–1048, worker 1049–1076, vehicle 1077–1080): type/range checks "if present", no presence enforcement; models require `name` etc. Same impact class as 024 (error stability + disclosure, rejects before write).

### Exact file
`H.S.H-V2.0.0/backend/src/sync/sync-service.ts`

### Exact function/component
`validateHshPayload`, lines 1007–1080.

### What the code actually does
Passes field-less creates through; `Model.create` throws raw `Path '…' is required`.

### Why this is a bug
Unstable per-op errors + schema internals to sync callers instead of stable `*_REQUIRED` codes.

### Evidence
Branch contents quoted in first audit and re-read; models' `required:true` fields confirmed.

### Runtime reproduction
STATICALLY PROVEN. NOT YET TESTED live.

### Actual impact
Error-contract instability + minor disclosure. No write occurs (terminal per-op failure).

### Correct future fix direction
Presence checks per entity at validation.

### Verification required during future fixing
Field-less create → stable code, no `Path … is required` leak; valid creates pass.

---

## PBS-BUG-026 — `incomingInvoice` alias/persistence gap + missing currency fallback

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives. Ingress unifies only `number → supplierInvoiceNumber` (lines 1422–1435, re-read); validation reads wider aliases; persistence spreads raw payload (create line 1758; `$set:payload` upsert line 1874) under strict schemas, so `total/date` aliases fail at Mongoose with raw text; currency fallback exists only on the HTTP invoice route, never on the sync path.

### Exact file
`H.S.H-V2.0.0/backend/src/sync/sync-service.ts`

### Exact function/component
Ingress 1422–1435; validation ~1255–1324; persistence 1750–1758 / 1865–1874.

### What the code actually does
Alias-aware gate, alias-unaware write, route-only currency default.

### Why this is a bug
Legacy `{total, date, number}` payloads pass validation then fail persistence with unstable raw errors — deterministic contract split. No partial write (create fails atomically).

### Evidence
Unification block quoted in first audit and re-read (`p.number` only); validation alias reads (`?? p.number / p.date / p.total`); `create([{...payload}])` raw spread.

### Runtime reproduction
STATICALLY PROVEN. NOT YET TESTED live.

### Actual impact
Legacy incoming-invoice sync callers get unstable failures; no corruption.

### Correct future fix direction
Normalize all aliases at ingress; apply DA currency fallback before validation/persistence.

### Verification required during future fixing
Legacy aliases stored canonically; missing currency → DA; invalid amounts → stable codes.

---

## PBS-BUG-027 — Request routes trust stale `linkedEntityId`; portal re-fetches

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives, re-verified: `worker-requests.ts:28-29,61-62` read `(user.account)?.linkedEntityId` from the auth-time snapshot; portal re-fetches fresh. Impact window narrowed: within one access-token lifetime (15 m) after a link/unlink/archive change. Note `worker-requests` also admits `supervisor` (line 27, 54) — scoping, not a defect.

### Exact file
`H.S.H-V2.0.0/backend/src/routes/worker-requests.ts` (same pattern: supplier/customer-requests, customer-orders)

### Exact function/component
List scoping lines 27–41; create scoping lines 60–72.

### What the code actually does
Scopes worker/supervisor reads/writes by snapshot id; managers pass explicit ids (unaffected).

### Why this is a bug
Post-lifecycle-change sessions operate under the pre-change id until token refresh — deterministic staleness window.

### Evidence
Route lines re-read above; portal fresh-read pattern per first audit (`rvb-portal.ts:88-90,117-119`).

### Runtime reproduction
STATICALLY PROVEN. NOT YET TESTED live (needs link change + old-token request).

### Actual impact
Wrong worker's request list / create denial-or-misattribution for ≤ one token lifetime after link changes.

### Correct future fix direction
Fresh-read account (or at least linkage) in request routes as portal does.

### Verification required during future fixing
Change link → old token lists fresh worker's rows, matching portal.

---

## PBS-BUG-028 — Web `authFetch` dead code; no 401 auto-refresh

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives. Re-grep: `authFetch` = definition + comment only, zero callers; all RVB services repeat direct `fetch` with `getAuthHeaders()` and no 401 path; access TTL 15 m; mobile `rvbRequest` proves the intended pattern (dedupe + single retry).

### Exact file
`H.S.H-V2.0.0/frontend/src/services/rvb-auth.service.ts` (definition lines 273–289)

### Exact function/component
`authFetch` (dead); per-service direct `fetch` (e.g. `rvb-worker.service.ts:9` pattern).

### What the code actually does
Throws 401s to UI after every access-token expiry until manual reload.

### Why this is a bug
Refresh helper written, never wired — deterministic session decay every 15 minutes of use.

### Evidence
Grep counts (2 vs 0); service fetch pattern; backend TTL.

### Runtime reproduction
STATICALLY PROVEN. NOT YET TESTED live (needs token-expiry wait).

### Actual impact
All RVB web pages break 15 min after login until reload.

### Correct future fix direction
Route RVB fetches through `authFetch` (single-retry semantics).

### Verification required during future fixing
Expire token → navigate → silent refresh, data loads, no reload.

---

## PBS-BUG-029 — Web refresh gated by `localStorage` hint

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives. Gate throws `RVB_NO_SESSION_HINT` pre-network (lines 117–137); backend accepts cookie-only refresh (rvb-auth.ts:225-239); comment shows the gate is intentional anti-loop design — but it deterministically strands valid-cookie sessions. Design tradeoff with a real defect tail.

### Exact file
`H.S.H-V2.0.0/frontend/src/services/rvb-auth.service.ts`

### Exact function/component
`refresh` lines 117–127; `refreshSession` lines 130–137; consumer `RvbAuthContext.loadMe`.

### What the code actually does
Refuses the network call when memory token + hint are both absent, even with a live HttpOnly cookie.

### Why this is a bug
Client-side marker overrules server-side session state; cleared-storage + live-cookie lands on login despite refresh succeeding if attempted.

### Evidence
Gate source quoted in first audit; backend cookie-only acceptance cited.

### Runtime reproduction
STATICALLY PROVEN. NOT YET TESTED live (needs cleared-storage + live-cookie browser test).

### Actual impact
Stranded sessions after storage clear / fresh profile with live cookie.

### Correct future fix direction
Attempt refresh whenever the cookie may exist; treat explicit 401 as no-session. With PBS-BUG-030.

### Verification required during future fixing
Clear `localStorage`, keep cookie → open `/rvb` → silent refresh succeeds.

---

## PBS-BUG-030 — `RvbAuthContext` clears hint on transient failure

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives. Catch-all `catch { clearLocal(); setUser(null); }` (lines 39–43) deletes the hint PBS-BUG-029 requires, converting one 500/blip into permanent logout. Mobile keeps token on ≥500/network (reference correct behavior).

### Exact file
`H.S.H-V2.0.0/frontend/src/contexts/RvbAuthContext.tsx`

### Exact function/component
`loadMe` catch, lines 24–47 (clear at ~39–43).

### What the code actually does
Indiscriminate session wipe on any refresh error.

### Why this is a bug
Deterministic escalation: transient → permanent. Downstream amplifier of 029.

### Evidence
Catch source quoted in first audit; mobile `auth-store.ts:61-70,98-106` contrast.

### Runtime reproduction
STATICALLY PROVEN. NOT YET TESTED live (needs 500-injection on refresh).

### Actual impact
Any transient refresh failure logs web users out permanently (until fresh login).

### Correct future fix direction
Clear only on terminal 401 codes (`REVOKED/DISABLED/ARCHIVED/TOKEN_INVALID/EXPIRED`); keep hint otherwise.

### Verification required during future fixing
500 → hint kept + retry; `RVB_SESSION_REVOKED` → clean logout.

---

## PBS-BUG-031 — Web `portal.me()` types/returns `entity`; backend sends `linkedEntity`

### Re-audit status
REJECTED — NOT A BUG

### Previous status
CONFIRMED

### Re-audit result
Overturned on reachability: `rvbPortalService.me()` has zero callers anywhere in `frontend/app` or `frontend/src` (re-grep for `rvbPortalService.me`/`portalService.me` + `.me()` call sites: only the definition). The key mismatch is real but nothing reads `.entity` from this method. (The `detail.entity` reads in `app/rvb/requests/page.tsx` come from the request-detail API shape, unrelated.)

### Exact file
`H.S.H-V2.0.0/frontend/src/services/rvb-portal.service.ts`

### Exact function/component
`me()`, lines 8–12.

### What the code actually does
Returns backend body verbatim typed as `{account, entity, entityType}` while backend sends `linkedEntity`.

### Why this is not a bug
Dead method — no production path observes the mismatch. Fix-or-remove when wiring; do not schedule as a defect.

### Evidence
Caller grep: no `rvbPortalService.me(` / `portalService.me(` outside the definition file.

### Runtime reproduction
NOT REPRODUCED (unreachable).

### Actual impact
None.

### Correct future fix direction
Map `linkedEntity` when the method is first wired. Not scheduled.

### Verification required during future fixing
N/A (rejected; if revived, assert entity detail populates).

---

## PBS-BUG-032 — Web `getWorkerFinancial()` calls nonexistent route (404)

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives with live callers: `app/rvb/page.tsx:361,892` call it with `.catch(() => [])`, so the 404 is swallowed into silently-empty financial panels. Route provably absent (`/worker/financial`); only `/worker/financial-events` exists (rvb-portal.ts:114); mobile calls the correct path.

### Exact file
`H.S.H-V2.0.0/frontend/src/services/rvb-portal.service.ts`

### Exact function/component
`getWorkerFinancial`, lines 18–22.

### What the code actually does
`GET /api/rvb/portal/worker/financial` → Express no-match → 404 → caught → `[]`.

### Why this is a bug
Wrong endpoint string + error-swallowing callers = permanently empty worker financial views on web.

### Evidence
Service line vs backend route grep (only `financial-events`); live callers with `.catch(()=>[])`.

### Runtime reproduction
STATICALLY PROVEN (request↔route mismatch + callers). NOT YET TESTED live (no server request issued).

### Actual impact
Web worker financial history always empty.

### Correct future fix direction
Point at `/worker/financial-events`; consider surfacing (not swallowing) transport errors at callers.

### Verification required during future fixing
Call → 200 + events; UI renders non-empty.

---

## PBS-BUG-033 — Web `getOrders(id)` calls nonexistent nested route (404)

### Re-audit status
REJECTED — NOT A BUG

### Previous status
CONFIRMED

### Re-audit result
Overturned on reachability: `rvbCustomerService.getOrders` has zero callers (re-grep whole frontend: only the definition at `rvb-customer.service.ts:42`). Customer order history on web flows via `rvbPortalService.getCustomerOrders()` (page.tsx:651 — portal route exists). The wrong URL is real but dead.

### Exact file
`H.S.H-V2.0.0/frontend/src/services/rvb-customer.service.ts`

### Exact function/component
`getOrders`, lines 42–46.

### What the code actually does
Would `GET /api/rvb/customers/:id/orders` (unmounted) if ever called.

### Why this is not a bug
Dead method — no production path hits the 404.

### Evidence
Caller grep: zero outside definition; portal orders path live and correct.

### Runtime reproduction
NOT REPRODUCED (unreachable).

### Actual impact
None.

### Correct future fix direction
Point at `/portal/customer/orders` or `/customer-orders?customerId=` when wiring. Not scheduled.

### Verification required during future fixing
N/A (rejected; if revived, assert 200 + orders).

---

## PBS-BUG-034 — Mobile directory search always returns `[]`

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives with live callers and a docs-vs-code contradiction noted: `search/index.tsx:37` and `secondary-chats:56,67` call `searchDirectory`; backend returns `{success, items, …}` (route spreads service result; service builds `items: safeItems` at lines 77–78); mobile returns `users || directory || results || []` → always `[]`. Mobile acceptance reports claiming directory PASS contradict the shipped code (either tested against a different backend shape or aspirational) — code governs.

### Exact file
`R.V.B-mobile/src/services/directory.service.ts`

### Exact function/component
`searchDirectory`, lines 3–13 (key line 12).

### What the code actually does
Drops the backend's `items` array unconditionally.

### Why this is a bug
Deterministic empty results on live screens (search + group-member picker).

### Evidence
Service line quoted in first audit; backend `items` verified (service lines 62–78); `api.get` returns the whole parsed body (client.ts:207); web client correctly reads `items`.

### Runtime reproduction
STATICALLY PROVEN (shape mismatch + live callers). NOT YET TESTED live (no device/emulator run).

### Actual impact
Mobile directory search + member picker always empty.

### Correct future fix direction
Read `items` (keep tolerant fallbacks).

### Verification required during future fixing
Search on device → non-empty results; pagination metadata ignored safely.

---

## PBS-BUG-035 — Web chat socket re-auth misses codes

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives with corrected code list. Server socket middleware emits: `RVB_UNAUTHENTICATED` (no token/account), `RVB_TOKEN_INVALID` (bad verify — expiry included, since `verifyAccessToken` throw maps here), `RVB_ACCOUNT_ARCHIVED/DISABLED`, `RVB_SESSION_REVOKED` (missing/unknown session, incl. post-rotation disconnect). Web handler covers only `TOKEN_INVALID/UNAUTHENTICATED` — so the `RVB_TOKEN_EXPIRED` claim in the first audit is withdrawn (expiry surfaces as `TOKEN_INVALID`, handled), but `SESSION_REVOKED` (rotation!) and account-disabled/archived are genuinely unhandled → 10 stale reconnects.

### Exact file
`H.S.H-V2.0.0/frontend/src/services/chat-socket.service.ts`

### Exact function/component
`connectChatSocket` `connect_error` handler, lines 32–43.

### What the code actually does
Refreshes + reconnects only on two substrings; rotation/disabled codes fall through to exhausted retries.

### Why this is a bug
Deterministic dead chat after refresh rotation (server `safeDisconnectSession` kills the old socket session) or account disable.

### Evidence
Handler quoted in first audit; server codes `chat-socket.ts:83-98` re-read; rotation disconnect `rvb-auth.ts:304-307`.

### Runtime reproduction
STATICALLY PROVEN. NOT YET TESTED live (needs rotation with open socket).

### Actual impact
Web chat stays disconnected until reload after rotation/disable. (Expiry alone is covered — correction recorded.)

### Correct future fix direction
Handle `RVB_SESSION_REVOKED` + `RVB_ACCOUNT_ARCHIVED/DISABLED` (refresh-or-logout routing); leave expiry path as-is.

### Verification required during future fixing
Rotate with chat open → refresh + reconnect; revoke → clean logout path.

---

## PBS-BUG-036 — Mobile SecureStore web fallback persists refresh token in `localStorage`

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives with confirmed platform scope: Expo web is a supported target (`package.json` `web` script, `react-native-web` dep), so the fallback is reachable, not hypothetical. Contract (`RVB-MOBILE-CONTRACT.md` storage rule) and web-app design (HttpOnly-only) both forbid JS-readable refresh storage.

### Exact file
`R.V.B-mobile/src/services/secure-store.ts`

### Exact function/component
`get/set/deleteRefreshToken` web fallbacks, lines 8–52.

### What the code actually does
On `Platform.OS === "web"` SecureStore failure, reads/writes the 30-day refresh token in `window.localStorage`.

### Why this is a bug
Deterministic long-lived credential in XSS-readable storage on a supported platform, contradicting documented storage rules.

### Evidence
Fallback lines quoted in first audit; web target support in `package.json`.

### Runtime reproduction
STATICALLY PROVEN. NOT YET TESTED live (needs Expo-web login + storage inspection).

### Actual impact
Expo-web runs only; native Keychain/Keystore path correct.

### Correct future fix direction
Fail closed on web (no `localStorage` fallback) or restrict mobile to native targets.

### Verification required during future fixing
Expo-web login → no `rvb.refreshToken` in `localStorage`; native login persists via SecureStore.

---

## PBS-BUG-037 — Mobile has zero navigation role guards

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives as UX/consistency (explicitly NOT privilege escalation — backend `requireRvbRole` enforces correctly). Gate handles auth states only (`_layout.tsx:52-75`); management screens fetch-then-403 (`accounts.tsx:33-46`); `canAccess*` helpers zero-imported in `app/`.

### Exact file
`R.V.B-mobile/app/_layout.tsx`

### Exact function/component
Auth gate, lines 52–75.

### What the code actually does
Lets portal roles mount management screens; denial arrives as data-fetch 403 flash.

### Why this is a bug (UX)
Deterministic skeleton-then-403 for deep-linked portal users; missing client routing the codebase already wrote helpers for.

### Evidence
Gate + screen + unused-helper traces in first audit; backend enforcement cited (no escalation).

### Runtime reproduction
STATICALLY PROVEN. NOT YET TESTED live.

### Actual impact
Confusing denial UX for worker/supplier/customer roles. No data exposure (backend 403s).

### Correct future fix direction
Guard management routes with existing `canAccess*` helpers.

### Verification required during future fixing
Worker opens `/profile/accounts` → immediate redirect/explanation, no 403 flash.

---

## PBS-BUG-038 — Purchases double-load; notifications race + stale refresh

### Re-audit status
CONFIRMED

### Previous status
CONFIRMED

### Re-audit result
Survives; three separable page-level defects (one ID, one page-pair root pattern — retained as filed, amplified by PBS-BUG-015): (a) purchases dual mount effects both fire on mount (lines 473–490) vs sales' single effect; (b) notifications fire-and-forget `load()` per keystroke with no sequence/abort (lines 56–82); (c) `handleMarkRead` skips `load()` on the routed path (line ~105–108), leaving the dot stale.

### Exact file
`H.S.H-V2.0.0/frontend/app/purchases/page.tsx` (+ `app/notifications/page.tsx`)

### Exact function/component
Purchases effects ~473–490; notifications `load`/`useEffect`/`useDbSync`/`handleMarkRead` ~56–108.

### What the code actually does
Duplicate concurrent Dexie reads on mount; overlapping out-of-order `setNotifications`; conditional refresh skip.

### Why this is a bug
Deterministic duplicate traffic + order-inversion window + stale read-state on the routed path.

### Evidence
Dual-effect source quoted in first audit; sales single-effect reference.

### Runtime reproduction
STATICALLY PROVEN. NOT YET TESTED live.

### Actual impact
Mount flicker/traffic; search-result inversion under fast typing; stale unread dot for routed notifications.

### Correct future fix direction
Merge mount effects into one param-keyed effect with sequence token/abort; always refresh after mark-read. After PBS-BUG-015.

### Verification required during future fixing
Single load on mount; rapid typing converges to final query; mark-read clears dot.

---

## PBS-BUG-039 — `task.name` uniqueness enforced in JS without DB index

### Re-audit status
NEEDS VERIFICATION

### Previous status
NEEDS VERIFICATION

### Re-audit result
Unchanged. Read-then-insert (`isTaskNameDuplicateUnfinished` + insert, lines 51–68 / 1712–1733) with no `unique:true` on `task.name` (unlike product/supplier/customer/vehicle) is a textbook race, but no concurrent execution was demonstrated and upsert paths add merge-check variants (lines 1847–1863) that complicate the claim.

### Exact file
`H.S.H-V2.0.0/backend/src/sync/sync-service.ts`

### Exact function/component
`isTaskNameDuplicateUnfinished` (~51–68); create site (~1712–1733); upsert site (~1847–1863).

### What the code actually does
Loads unfinished tasks, JS-compares trimmed names, then inserts — no atomic constraint.

### Why verification is still needed
Race needs two concurrent same-name creates against live MongoDB; single-client behavior correct.

### Evidence
Schema lacks `unique:true`; enforcement is read-then-insert (first audit).

### Runtime reproduction
NOT YET TESTED (needs concurrent-request harness vs test DB).

### Actual impact
Unknown until tested; at most duplicate unfinished tasks under concurrency.

### Correct future fix direction
Partial unique index (unfinished-only) or serialized creates — only after reproduction + trim/collation semantics check.

### Verification required during future fixing
Two concurrent same-name creates → exactly one succeeds; completed-name reuse per spec intact.

---

## PBS-BUG-040 — Chat `isAdmin = role === "admin"` excludes `manager`

### Re-audit status
NEEDS VERIFICATION

### Previous status
NEEDS VERIFICATION

### Re-audit result
Unchanged, with NEEDS PRODUCT SPEC attached: consequence is deterministic (`deleteMessage`: non-sender + `!isAdmin` → 403, service line 656; routes pass `isAdmin = role === "admin"`, chats.ts:196-199) but defect-vs-intent is undecided — least-privilege chat moderation may be deliberate, and no spec equates manager/admin for chat (unlike workers/accounts routes).

### Exact file
`H.S.H-V2.0.0/backend/src/routes/chats.ts`

### Exact function/component
Moderation flag, lines 196–199; `deleteMessage` (services/chat.service.ts:651–656).

### What the code actually does
Managers deleting others' messages get 403 deterministically.

### Why verification is still needed
Code consequence proven; product intent unknown. Do not "fix" without the moderation matrix.

### Evidence
```ts
const isAdmin = acc?.role === "admin"; // chats.ts
if (msg.senderAccountId !== deleterId && !isAdmin) throw codeError("RVB_FORBIDDEN", 403); // chat.service.ts:656
```

### Runtime reproduction
STATICALLY PROVEN (consequence). Intent NOT YET TESTED (needs spec + live manager-token test).

### Actual impact
Manager chat moderation denied (if unintended) or by design (if intended).

### Correct future fix direction
Confirm matrix first; include `manager` only if parity intended.

### Verification required during future fixing
Manager deletes another's message → allowed-or-documented; worker still denied.

---

## Audit Summary (Re-Audit)

- **Total IDs:** 40. **CONFIRMED:** 28. **NEEDS VERIFICATION:** 3 (016, 039, 040). **REJECTED — NOT A BUG:** 4 (001, 003, 031, 033). **DESIGN / HARDENING ISSUE:** 4 (006, 011, 020, 021). **CONFIRMED — LEGACY-ONLY:** 1 (009). **New IDs:** 0.
- **Downgraded from CONFIRMED:** 001, 003, 006, 009 (→legacy-only), 011, 016, 020, 021, 031, 033.
- **Rejected IDs stay reserved** and must not be reused.
- **Files with most confirmed defects:** `backend/src/sync/sync-service.ts` (022–026), `frontend/src/services/sync/*` (004, 005, 007, 008, 010, 012, 013, 014), `frontend/src/services/rvb-auth.service.ts` + context (028–030).
- **Important couplings (regression-test links only — ONE PBS-BUG ID per debugging cycle; no repair prompt may silently modify a related ID; shared-code changes affecting another ID must be explicitly documented and reviewed first):** 002↔010 (strongly coupled); 007+008 (same branch); 029←030 (hint lifecycle); 015→038 (retest order); 004+005 (same root cause).
- **Insufficiently tested areas:** live sync round-trips, cross-tab races, concurrent DB races (039), token-expiry/socket-rotation flows, Expo-web/mobile device runs, backend `test-*.ts` + Playwright suites (not executed), StrictMode determination (017).

## Recommended Debugging Sequence

One PBS-BUG ID per debugging cycle. Grouping below is scheduling guidance only; fixing an ID must not silently modify a related ID.

### Foundation (schedule first; still one ID per cycle, related IDs regression-tested)
PBS-BUG-002, PBS-BUG-010 (strongly coupled — regression-test the other when fixing either), PBS-BUG-028, PBS-BUG-029, PBS-BUG-030 (session survival gates all RVB retesting), PBS-BUG-020 decision (deployment intent gates 021/023 exposure readings).

### Independent (any order once foundations stable; related IDs regression-tested)
004, 005 (same root cause), 007, 008 (same branch), 012, 013, 014, 015, 017, 018, 019, 022, 023, 024, 025, 026, 027, 032, 034, 035, 036, 037, 038 (after 015).

### Downstream / retest-only
008 after 007; 038 after 015; 029 retest after 030; 023/025 retest after 020 decision.

### Verify-first (no fix until proven + spec)
016 (browser reproduction), 039 (concurrency harness), 040 (moderation matrix + live test).

### Closed (no action)
001, 003, 031, 033 (rejected — see entries). 006, 011, 021 (hardening backlog).

---

# Debugging Baseline Status

- Inventory IDs: PBS-BUG-001 through PBS-BUG-040
- Count validation: PASS
- Re-audit completed: YES
- Application code modified during inventory audit: NO
- Baseline frozen: YES

## READY FOR DEBUGGING

YES
