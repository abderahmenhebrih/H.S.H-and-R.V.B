# TEMP-PBS-BUG-023-AUDIT -- notification sync channel isolation failure

Status: **FIXED -- READY FOR GIORNO REVIEW** (see section 34).
Bug remains open -- only Giorno can close it.

Date (UTC): 2026-09-27.
Workspace: `C:\Users\islam\OneDrive\Desktop\poultry-business-suite`
Runtime under test: backend `tsx` + `mongoose 9.9.3` + `mongodb-memory-server 11.3.0`
(single-node replica set, transactions live), driving the REAL exported
`processSyncOperation()` and REAL `getChangesAfter()` with REAL Mongoose models.
No mocks. Node v22.

START-OF-CYCLE CLEANUP (PBS-BUG-022 is CLOSED):
- Deleted `TEMP-PBS-BUG-022-AUDIT.md` (was committed; now shows as `D`).
- `tmp-pbs022-baseline.ts` was already removed in-cycle; no remnants found.
- The permanent PBS-BUG-022 normalization block (L1437+) was NOT reverted -- verified
  present and intact in final checks.

---

## 1. Bug definition

PBS-BUG-023 (CONFIRMED, both halves runtime-proven): notification sync channel
isolation fails in two coupled ways. HSH sync forces every notification payload to
`channel:"hsh"` but locates existing documents by `{id}` without proving HSH
ownership, so an HSH operation targeting an RVB notification id mutates/converts or
deletes the RVB document. Separately, notification delete SyncChanges are
payload-less, and `getChangesAfter()` retains payload-less deletes because it cannot
determine their channel -- so an RVB notification deletion leaks into the HSH feed as
revision/entity/entityId/operation metadata.

## 2. Two-half decomposition

- HALF A (mutation/hijack): cross-channel update/upsert/delete convert or destroy RVB
  docs. Reproduced B3/B4/B5.
- HALF B (feed leak): RVB notification deletes visible to HSH `getChangesAfter`.
  Reproduced B6. Classified independently per the decision gate; BOTH reproduced,
  BOTH fixed.

## 3. Notification model contract (A1)

`backend/src/models/notification.model.ts`: `id` String required UNIQUE GLOBALLY
(not per-channel -- the same id CANNOT exist in both channels; a duplicate HSH doc
with an RVB id would violate the unique index, so upsert-rejection must not create).
`channel` enum `["hsh","rvb"]`, required, default `"hsh"`. Indexes include
`{channel:1, sourceEventId:1}` unique sparse + `{channel:1}` (+ server-startup
`ensureNotificationIndexes`/`migrateLegacyNotificationChannels`, untouched).
Strict mode default (unknown keys stripped).
Related scoping fact: the RVB side (`rvb-notification.service.ts`,
`rvb-notifications.ts` routes) queries with explicit `{channel:"rvb"}` everywhere,
creates via model directly (never writes SyncChange), and NEVER deletes Notification
documents (read/archive are per-recipient flags) -- so the ONLY producer of RVB
notification SyncChange rows is the HSH sync path itself (B5), plus legacy rows.

## 4. SyncChange schema contract (A2)

`backend/src/models/sync-change.model.ts`: `revision` Number required unique;
`entity`/`entityId` String required indexed; `operation` enum
create/update/delete required; `payload` Mixed optional; `changedAt`,
`sourceClientId?`, `operationId?`. NO channel/source metadata field exists.
Delete records therefore have NO durable channel -- the feed half's root cause.
`payload` being Mixed means a minimal `{channel}` delete payload needs NO schema
change (C2 design basis, verified client-safe in section 21 notes).

## 5. Ingress channel behavior (A3)

`processSyncOperation` L1416-1420 (current, unchanged by this fix): for
`entity === "notification"`, ANY caller channel (absent, `"hsh"`, `"rvb"`) is
OVERWRITTEN to `"hsh"` on the cloned payload -- accepted unconditionally, never
rejected. Applies identically to create/update/upsert/delete. For CREATE of a new
id this remains valid (HSH frontend type exposes no channel; canonical assignment
preserved). For existing-document paths it is the hijack enabler (no ownership
proof follows it) -- fixed at the lookup sites, not by changing ingress (HSH
behavior preserved per rule 9).

## 6. Existing-document query inventory (A4)

- Create flow L1705: `findOne({ id })` -- pre-fix, RVB hit returned "Entity already
  exists." SUCCESS (no mutation, but claims the RVB doc as the canonical result).
- Upsert-existing L1835: `findOne({ id })` -- pre-fix, RVB hit flowed into candidate
  validation + `$set` mutation (B4 hijack, no duplicate only because `id` is
  globally unique).
- Update flow L2038: `findOne({ id })` -- pre-fix, RVB hit flowed into generic `$set`
  with forced-hsh payload (B3 hijack + conversion).
- Delete flow L2227: `findOne({ id })` -- pre-fix, RVB hit flowed into `deleteOne`
  + payload-less change (B5 destruction + B6 leak seed).
- Create-flow sourceEventId dedup L1670: `findOne({ channel: "hsh", sourceEventId })`
  -- ALREADY channel-scoped (in-repo precedent for the fix's approach); untouched.
- RVB service reads: always `{id, channel:"rvb"}`-scoped; untouched.

## 7. Delete recording behavior (A5)

- Notification create: change payload = canonical doc (channel hsh) -- fine.
- Notification update/upsert: change payload = updated doc (post-hijack claimed hsh
  pre-fix) -- symptom of half A, fixed at the guard (no change recorded on reject).
- Notification delete (generic path L2283-2298): `deleteOne({id})` then change
  `{revision, entity, entityId, operation:"delete", payload: undefined, ...}` --
  payload-less BY CONSTRUCTION (pre-fix). Post-fix: `{channel}` of the (proven
  HSH-owned) deleted doc; missing-entity deletes stay payload-less (idempotent path
  unchanged).

## 8. getChangesAfter filtering behavior (A6)

L2407-2436 (pre-fix): notification changes excluded iff payload carries non-hsh
`channel`, or `/rvb` route, or RVB `sourceEventId` prefixes; payload-less deletes
explicitly KEPT ("payload missing => keep", L2411) -- the leak. Verified per class:
HSH create/update INCLUDED (B1); RVB payload-bearing EXCLUDED (B7); HSH delete KEPT
(B8 -- must survive); RVB delete LEAKED (B6 -- the bug); non-notification deletes
KEPT (B9 -- must survive). `nextRevision` derives from the UNFILTERED fetch (L2405),
so filtering never strands the cursor (proven F13).

## 9. Bootstrap comparison (A7)

`routes/sync.ts` L98-106: bootstrap explicitly `Notification.find({channel:"hsh"})`.
Confirms intended HSH feed isolation; unchanged (not part of the fix). Also bounds
the C3 ghost risk: a full re-bootstrap reconciles from hsh-only docs.

## 10. Runtime environment (Phase B)

Disposable `backend/tmp-pbs023-baseline.ts` (deleted after the cycle): REAL
`processSyncOperation()` + REAL `getChangesAfter()`/`getCurrentRevision()` + REAL
models on MongoMemoryReplSet (transactions live). RVB fixtures via direct model
create (channel rvb preserved -- never through HSH ingress). HSH ops via sync ops
(`clientId qa-hsh`). Unique ids per case. JSONL observation: result, doc before/
after (channel/title/message), doc counts, per-entity change rows, feed slices.
Harness quirk documented: fixtures/payloads carry UNIQUE sourceEventIds (mirrors
real RVB `chat:`/`request:` patterns) after observing a PRE-EXISTING orthogonal
index behavior -- docs lacking sourceEventId collide on `channel_1_sourceEventId_1`
as null once the background index build completes (out of 023 scope; HSH payloads
in Baseline B1-B9 all carried unique ids so results are unaffected).

## 11. HSH control results (B1/B8)

- B1 HSH create: `{success:true}`, doc `{channel hsh}`, change in HSH feed. PASS.
- B8 HSH create+delete: both succeed; doc gone; delete change present in feed
  (payload-less pre-fix). PASS -- behavior the fix must preserve (F4/F10).

## 12. RVB fixture/control results (B2/B7/B9)

- B2 RVB model create: `{channel rvb}` persisted. PASS.
- B7 synthetic RVB payload-bearing update change: EXCLUDED from HSH feed. PASS
  (filter works when channel metadata exists).
- B9 product payload-less delete via sync: success + VISIBLE in feed. PASS
  (non-notification deletes must survive -- F12).

## 13. Update hijack reproduction (B3)

HSH `update` on RVB id: `{success:true}`; doc `rvb-title` -> `HIJACKED-UPDATE`,
`channel` rvb -> hsh, message overwritten; update change recorded claiming hsh.
MUTATION + CONVERSION proven.

## 14. Upsert hijack reproduction (B4)

HSH `upsert` on existing RVB id: `{success:true}`; same conversion
(`HIJACKED-UPSERT`); `countDocuments({id})` stays 1 (mutated in place -- global id
uniqueness prevents a second doc, so rejection (not re-creation) is the only safe
fix).

## 15. Cross-channel delete reproduction (B5)

HSH `delete` on RVB id: `{success:true}`; doc GONE; payload-less delete change
recorded (rev N). Destruction proven (and it seeds the B6 leak).

## 16. RVB delete feed-leak reproduction (B6)

`getChangesAfter(0)` returns the B5 delete as `{revision, entity:"notification",
entityId:NR5, operation:"delete"}` with NO payload/channel -- RVB metadata leaked
to HSH clients. (B3/B4 hijack updates appear as hsh -- expected post-conversion.)

## 17. HSH delete control (B8)

Covered in section 11: HSH delete change present pre-fix (payload-less) and must
remain present post-fix (channeled) -- F4/F10.

## 18. Non-notification delete control (B9)

Covered in section 12: product payload-less delete visible pre-fix and must remain
so -- F12. The fix gates ONLY `entity === "notification"`.

## 19. Root cause -- mutation half

Ingress forces `channel:"hsh"` but no lookup proves ownership: create/upsert/update/
delete all resolve existing docs by bare `{id}`, then mutate/convert/delete. The one
already-scoped query (sourceEventId dedup, `{channel:"hsh",...}`) proves the codebase
knows the pattern; it was simply never applied to the id lookups.

## 20. Root cause -- feed half

SyncChange has no channel field and delete recording wrote `payload: undefined`, so
by delete time the channel is unknowable; the feed filter therefore kept
payload-less deletes, leaking RVB deletions (whose ONLY realistic producer is the
half-A cross-channel delete itself, plus legacy rows).

## 21. Fix design -- ownership isolation (C1)

New module-scope helper + four guards, all returning the ESTABLISHED generic
`"Entity not found."` outcome (message+error, terminal failure record, retryable
false -- mirroring the update-missing shape; NO new public error code, justified
because "no HSH-owned notification with that id" is exactly what the code means):

```ts
function isHshOwnedNotification(entity: string, existing: any): boolean {
  if (entity !== "notification" || !existing) return true;
  return (existing as any).channel === "hsh";
}
```

- Create flow (after L1705 lookup): RVB hit -> reject (was: "already exists" success
  pointing at the RVB doc).
- Upsert flow (after L1835 lookup): RVB hit -> reject (was: validate + `$set`
  hijack). Upsert-missing still creates canonical hsh (safe: no doc with that id).
- Update flow (after L2038 `!existing` block): RVB hit -> reject with the same
  terminal record shape (was: `$set` hijack + conversion).
- Delete flow (inside `if (existing)` after L2227 lookup): RVB hit -> reject, no
  delete, no change (was: destroy + payload-less change).
- Helper returns true for non-notifications and missing docs: zero behavior change
  outside notifications (proven by 34/34 suite + F12).

## 22. Fix design -- delete channel durability (C2)

Delete change recording: `payload: undefined` ->
`payload: (entity === "notification" && existing) ? { channel: existing.channel } : undefined`.
`existing` is in scope; for notifications the guard guarantees HSH ownership, so new
HSH deletes record `{channel:"hsh"}` and missing-entity deletes stay payload-less
(idempotent path unchanged). No schema change (Mixed accepts it); frontend
`apply.ts` delete branch ignores payloads (verified read-only: `table.delete(id)`
only), so no client change needed. Other entities untouched.

## 23. Legacy payload-less delete policy (C3)

Feed rule added: notification `delete` changes with missing/non-object/channel-less
payload are EXCLUDED. Rationale: post-fix, HSH deletes always carry `hsh` and RVB
deletes always carry `rvb` (or are rejected pre-record), so a chanelless row is
provably legacy/unknown -- and an unknown channel MUST NOT be exposed as HSH (RVB
metadata leak is deterministic otherwise). Compatibility (ghost risk): a stale HSH
client that missed an old delete tombstone could keep a ghost row; mitigations --
HSH clients that applied it stay correct, full re-bootstrap is hsh-only
(`routes/sync.ts`), and the alternative (leaking RVB delete metadata to every HSH
client on every pull) is strictly worse. Non-notification payload-less deletes
explicitly unaffected (rule + F12). No new SyncChange field (payload suffices --
rule: no model change without need; none needed).

## 24. Permanent files changed

Exactly ONE: `H.S.H-V2.0.0/backend/src/sync/sync-service.ts` (+84/-1 across 7
regions; verified by `git diff --stat`). No model, route, frontend, or other
backend file changed.

## 25. FULL BEFORE code for every modified permanent file

All 7 regions, complete (only file modified):

B1 (helper -- did not exist; insertion after `checkStaleCrossClient` L301, before
`handleSaleCreate` L303).

B2 (create flow): after
`const existing = await (model as any).findOne({ id: operation.entityId }).session(session as any);`
came directly `if (existing) {` (then "Entity already exists." success).

B3 (upsert flow):
```ts
          const existingUpsert: any = await (model as any).findOne({ id: operation.entityId }).session(session as any);
          if (existingUpsert) {
```

B4 (update flow): the `!existing` terminal block closed, followed directly by
`// INVOICE_IMMUTABLE checks`.

B5 (delete flow):
```ts
        const existing: any = await (model as any).findOne({ id: operation.entityId }).session(session as any);
        if (existing) {
```

B6 (delete change):
```ts
              revision,
              entity: operation.entity,
              entityId: operation.entityId,
              operation: "delete",
              payload: undefined,
```

B7 (feed filter): after the route/sourceEventId pattern checks came directly
`// otherwise keep (hsh)` (payload-less deletes kept).

## 26. FULL AFTER code for every modified permanent file + complete unified diff

A1 (helper, new L303-311):
```ts
// PBS-BUG-023: HSH sync owns ONLY channel-"hsh" notifications. An existing
// document from another channel must be treated as absent for HSH purposes:
// never mutated, never converted, never deleted through this path. Callers use
// the established generic "Entity not found." outcome (no new error code).
function isHshOwnedNotification(entity: string, existing: any): boolean {
  if (entity !== "notification" || !existing) return true;
  return (existing as any).channel === "hsh";
}
```

A2 (create guard): 11-line `"Entity not found."` terminal record + result + return
inserted between the L1705 lookup and `if (existing) {` (full text in the literal
diff below).

A3 (upsert guard): 8-line identical-shape guard inserted between the L1835 lookup
and `if (existingUpsert) {`.

A4 (update guard): 33-line guard (result object + terminal record mirroring the
adjacent update-missing shape) inserted between the `!existing` block and
`// INVOICE_IMMUTABLE checks`.

A5 (delete guard): 8-line guard inserted between the L2227 lookup and
`if (existing) {`.

A6 (delete change): `payload: undefined` replaced by the conditional
`operation.entity === "notification" && existing ? { channel: existing.channel } : undefined`
(with 6-line comment).

A7 (feed rule): 6-line exclusion inserted before `// otherwise keep (hsh)`:
```ts
      if (c.operation === "delete" && (!payload || typeof payload !== "object" || !(payload as any).channel)) return false;
```

Complete unified diff (literal, verified line-exact against `git diff`):

```diff
diff --git a/H.S.H-V2.0.0/backend/src/sync/sync-service.ts b/H.S.H-V2.0.0/backend/src/sync/sync-service.ts
index 49df5ca..9b660a5 100644
--- a/H.S.H-V2.0.0/backend/src/sync/sync-service.ts
+++ b/H.S.H-V2.0.0/backend/src/sync/sync-service.ts
@@ -300,6 +300,15 @@ async function checkStaleCrossClient(
   return true;
 }

+// PBS-BUG-023: HSH sync owns ONLY channel-"hsh" notifications. An existing
+// document from another channel must be treated as absent for HSH purposes:
+// never mutated, never converted, never deleted through this path. Callers use
+// the established generic "Entity not found." outcome (no new error code).
+function isHshOwnedNotification(entity: string, existing: any): boolean {
+  if (entity !== "notification" || !existing) return true;
+  return (existing as any).channel === "hsh";
+}
+
 async function handleSaleCreate(session: any, payload: Record<string, unknown>, clientId: string): Promise<string | null> {
   const items: any[] = (payload as any).items;
   const customerId = String((payload as any).customerId);
@@ -1703,6 +1712,17 @@ export async function processSyncOperation(
           }
         }
         const existing = await (model as any).findOne({ id: operation.entityId }).session(session as any);
+        // PBS-BUG-023: an existing non-HSH notification is not an HSH document --
+        // do not report it as "already exists" success; treat as absent.
+        if (!isHshOwnedNotification(operation.entity, existing)) {
+          const err = "Entity not found.";
+          await ProcessedSyncOperationModel.create(
+            [{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }],
+            { session },
+          );
+          result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
+          return;
+        }
         if (existing) {
           const existingRevision = (existing as any).serverRevision ?? 0;
           canonical = existing;
@@ -1833,6 +1853,14 @@ export async function processSyncOperation(
 
       if (operation.operation === "upsert") {
         const existingUpsert: any = await (model as any).findOne({ id: operation.entityId }).session(session as any);
+        // PBS-BUG-023: never treat an existing non-HSH notification as an HSH
+        // upsert target (no mutation, no conversion, no duplicate).
+        if (!isHshOwnedNotification(operation.entity, existingUpsert)) {
+          const err = "Entity not found.";
+          await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
+          result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
+          return;
+        }
         if (existingUpsert) {
           // INVOICE_IMMUTABLE: reject generic mutations on ISSUED/CANCELLED and DRAFT->ISSUED/CANCELLED transitions
           if (operation.entity === "invoice") {
@@ -2073,6 +2101,39 @@ export async function processSyncOperation(
           );
           return;
         }
+        // PBS-BUG-023: an existing non-HSH notification must not be updated
+        // (and must not be converted to "hsh") through HSH sync.
+        if (!isHshOwnedNotification(operation.entity, existing)) {
+          const err = "Entity not found.";
+          result = {
+            operationId: opId,
+            entity: operation.entity,
+            entityId: operation.entityId,
+            operation: operation.operation,
+            success: false,
+            message: err,
+            error: err,
+            retryable: false,
+          };
+          // Only record terminal failure for update-not-found (terminal)
+          await ProcessedSyncOperationModel.create(
+            [
+              {
+                operationId: opId,
+                entity: operation.entity,
+                entityId: operation.entityId,
+                operation: operation.operation,
+                success: false,
+                error: err,
+                retryable: false,
+                processedAt: new Date(),
+                clientId: operation.clientId,
+              },
+            ],
+            { session },
+          );
+          return;
+        }
         // INVOICE_IMMUTABLE checks
         if (operation.entity === "invoice") {
           const srvStatus = (existing as any).status;
@@ -2225,6 +2286,14 @@ export async function processSyncOperation(
 
       if (operation.operation === "delete") {
         const existing: any = await (model as any).findOne({ id: operation.entityId }).session(session as any);
+        // PBS-BUG-023: an existing non-HSH notification must not be deleted (and
+        // must not generate a delete change) through HSH sync.
+        if (!isHshOwnedNotification(operation.entity, existing)) {
+          const err = "Entity not found.";
+          await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: err, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
+          result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: err, error: err, retryable: false };
+          return;
+        }
         if (existing) {
           const existingRev = (existing as any).serverRevision ?? 0;
           if (operation.baseRevision !== undefined && operation.baseRevision < existingRev) {
@@ -2288,7 +2357,15 @@ export async function processSyncOperation(
               entity: operation.entity,
               entityId: operation.entityId,
               operation: "delete",
-              payload: undefined,
+              // PBS-BUG-023: notification deletes carry their channel so the HSH
+              // feed can filter them later; `existing` is in scope above and (for
+              // notifications) is guaranteed HSH-owned by the guard. Frontend
+              // delete application ignores payloads (apply.ts), and Mixed schema
+              // needs no model change. Other entities stay payload-less.
+              payload:
+                operation.entity === "notification" && existing
+                  ? { channel: (existing as any).channel }
+                  : undefined,
               changedAt: new Date(),
               sourceClientId: operation.clientId,
               operationId: opId,
@@ -2417,6 +2494,12 @@ export async function getChangesAfter(
         if (route && route.startsWith("/rvb")) return false;
         if (src && /^(worker-request:|supplier-request:|customer-request:|customer-order:|chat:)/.test(src)) return false;
       }
+      // PBS-BUG-023: channel-unknown notification deletes (legacy payload-less
+      // rows) are excluded -- an unknown channel must not leak as HSH. Current
+      // HSH deletes carry {channel:"hsh"} and RVB deletes never reach the feed
+      // (rejected before recording), so only legacy rows hit this rule.
+      // Non-notification payload-less deletes are unaffected.
+      if (c.operation === "delete" && (!payload || typeof payload !== "object" || !(payload as any).channel)) return false;
       // otherwise keep (hsh)
     }
     return true;
```

(All other ~2540 lines byte-identical to HEAD.)

## 27. Verification commands

From `H.S.H-V2.0.0/backend`:
1. Baseline: `npx tsx tmp-pbs023-baseline.ts` -> B1/B2/B8/B9 controls green;
   B3/B4 hijack, B5 destroy, B6 leak reproduced.
2. Post-fix: `$env:PBS023_MODE="postfix"; npx tsx tmp-pbs023-baseline.ts` ->
   F1-F13 all green (section 28).
3. Existing suite: `npm run test:hsh-sync` -> `34 passed, 0 failed` (fix in place).
4. Typecheck: `npx tsc --noEmit` -> exit 0, no output.
5. Lint: backend ESLint NOT configured (no config/deps; re-confirmed this cycle) --
   nothing to run.
6. Scope: `git diff --name-only` (repo root) -> sync-service.ts + prior-cycle audit
   deletion only.

## 28. Exact outputs/results

- B1: `{success:true, doc:{hsh,...}, inFeed:true}`.
- B3: `{success:true}` + `rvb-title->HIJACKED-UPDATE`, `rvb->hsh`, hsh-claiming change.
- B4: same via upsert, `docCount:1`.
- B5: `{success:true}`, doc null, payload-less delete change rev N.
- B6: feed contains `{rev, notification, NR5, delete}` with no payload.
- B7: RVB payload-bearing excluded. B8: HSH delete change present. B9: product
  delete change present.
- F1: `{success:true, hsh, inFeed:true}`. F2/F3: HSH update/upsert succeed, content
  applied (`HSH-UPSERTED`).
- F5/F6/F7: `{success:false, error:"Entity not found."}`, RVB docs byte-identical
  (`channel rvb`, original titles/messages), `newChanges:0`, F6 `docCount:1`.
- F4: HSH delete succeeds; change `{rev 4, delete, payload:{channel:"hsh"}}` visible.
- F8/F9/F11: RVB-bearing / RVB-delete / legacy payload-less deletes all absent.
- F12: product payload-less delete present.
- F13: `revs:[9,11]` (filtered rev 10 skipped, N+2 reached), `currentRevision:11`,
  `next:11`, repull `0` (no loop).
- Full JSONL captured in-session; disposable script removed afterwards.

## 29. Revision/cursor test (F13)

Sequence rev9 = HSH notification create, rev10 = synthetic legacy payload-less
notification delete, rev11 = product delete. `getChangesAfter(8)` returns revs 9
and 11 only, `hasMore:false`, `currentRevision:11`, `nextRevision:11`; a follow-up
pull from 11 returns 0 changes. Filtering is cursor-safe: excluded revisions still
advance `nextRevision` (computed pre-filter), so clients never stall or loop.

## 30. Atomicity proof (F14)

Rejected cross-channel ops (F5/F6/F7): target docs byte-identical before/after,
zero new SyncChange rows for those entityIds, failure recorded only in
ProcessedSyncOperation (terminal, retryable false). No partial writes by
construction (guards return before any mutation inside the same transaction).

## 31. Existing sync-suite result (F15)

`npm run test:hsh-sync`: `=== H.S.H sync integrity: 34 passed, 0 failed ===`
with the 023 fix applied (022 normalization intact and unaffected).

## 32. Regression-boundary proof

`git diff --name-only`: `H.S.H-V2.0.0/backend/src/sync/sync-service.ts` (+84/-1)
+ `TEMP-PBS-BUG-022-AUDIT.md` (expected prior-cycle cleanup deletion). Untouched:
019 frontend fix (L732 verified), 017 settings fix, 015 useDbSync, sync manager
services, 020 auth/trust (no route change), 021 batch/rate-limit, 023-adjacent 024
payments / 025 generic validation / 026 incomingInvoice (no hunk touches their
code), models/schemas (no migration), frontend (zero files). The 022 block
(L1437+) untouched (diff hunks start at L300 helper; no overlap).

## 33. Remaining uncertainty

1. Pre-existing orthogonal index quirk: docs without `sourceEventId` collide on
   `channel_1_sourceEventId_1` as null once the background index build completes
   (observed: HSH update without sourceEventId failed E11000 rather than
   hijacking). Real docs/payloads carry sourceEventIds, and it is independent of
   channel protection (it fails closed). Flagged for triage, NOT 023 scope. LOW.
2. Legacy HSH ghost risk from excluding old payload-less deletes (section 23):
   bounded by hsh-only bootstrap reconciliation. LOW.
3. RVB flows that might one day legitimately need HSH-visible notification deletes
   would need an explicit channeled record -- no such flow exists today. LOW.

## 34. Final status

FIXED -- READY FOR GIORNO REVIEW
