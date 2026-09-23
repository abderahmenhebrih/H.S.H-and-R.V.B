# H.S.H FINAL RELEASE-BLOCKER FIX

## Project

`C:\Users\islam\OneDrive\Desktop\H.S.H and R.V.B\H.S.H-V2.0.0`

H.S.H ONLY.

Do not touch:

- sibling R.V.B-mobile
- R.V.B portal behavior
- `/api/rvb/*`
- R.V.B auth/chats/requests/orders/directory/notifications
- `RVB-MOBILE-CONTRACT.md`
- `.env` or secrets

## Current confirmed state

Preserve all working Pass 7 behavior:

- Sale create/update/delete server-authoritative and atomic
- Purchase create/update/delete server-authoritative and atomic
- Payment create/update/delete server-authoritative and atomic
- Transfer create atomic; update/delete explicitly unsupported
- server rejects stale revisions regardless of clientId
- derived Product/Customer/Supplier/Bank mutations use `queueSync:false`
- queue coalescing works
- in-flight operations are immutable during an active request
- successor operations use separate operationIds and rebase after parent success
- cross-tab fallback lease has ownerId + heartbeat + owner-safe release
- Customer incoming payment works when Bank balance is 0
- snapshot reconciliation protects pending business-derived state
- Office spreadsheet protections are already green
- backend sync suite currently reports 34/34
- frontend sync suite currently reports 23/23
- H.S.H regression suite currently reports 32/32

Do not redesign these systems unless necessary for the blocker below.

---

# P0 — CRITICAL: abandoned `in_flight` operation recovery

## Confirmed failure

Current queue behavior includes persisted `status: "in_flight"`.

`getPendingSyncOperations()` excludes `in_flight`.

If the browser/tab/process crashes after:

`pending -> in_flight`

but before the HTTP response is processed, the row survives in IndexedDB as `in_flight`.

After restart, no normal pending query returns it.

The operation can remain stuck forever.

## Required safety property

An `in_flight` operation left behind by a dead sync owner must become retryable again.

The solution must also be safe when another tab is actively syncing.

### Important design constraint

Do **not** blindly reset every `in_flight` row at arbitrary app startup.

Two tabs share IndexedDB. A second tab may start while the first tab is legitimately sending a request.

Recovery must occur only while the current context owns the same exclusive cross-tab sync lock used by `syncCycle`.

Once the process/tab owns that exclusive lock:

- no other healthy sync push may be active
- any remaining persisted `in_flight` row is abandoned
- it is safe to recover it for retry

## Preferred implementation

Add a queue function similar to:

`recoverAbandonedInFlightOperations()`

Run it **inside the exclusive `withCrossTabLock` critical section**, before normal push processing.

Within one Dexie transaction:

- find unsynced `status === "in_flight"` rows
- preserve:
  - operationId
  - entity
  - entityId
  - operation
  - payload
  - baseRevision
  - createdAt
  - dependsOnOperationId
  - parentOperationId
  - attempts/error diagnostics
- transition them back to a retryable queue state
- recommended state: `retrying` or `pending`
- do not create a new operationId
- do not duplicate the row
- do not discard successors

The same original operationId must be retried.

This is essential because if the server committed before the crash, `ProcessedSyncOperation` idempotency can safely return the prior result without double-applying effects.

## Ordering requirements

If recovered OP1 has successor OP2:

- OP1 must remain logically before OP2
- OP2 must not be sent first while it still depends on OP1
- if retry of OP1 returns prior success revision 6:
  - normal successor rebasing must set OP2 baseRevision to 6
  - OP2 then becomes sendable
- if OP1 returns terminal failure:
  - existing terminal/reconciliation behavior must handle OP1
  - OP2 must not be silently deleted

## Cross-tab requirement

Recovery must not undermine:

- `navigator.locks` path
- fallback IndexedDB lease
- owner heartbeat
- owner-safe release

Test scenario:

Tab A is actively syncing and owns lock.
Tab B starts.

B must wait for lock.
B must NOT reset A's active `in_flight` operation while A owns the lock.

If A crashes:
- Web Lock releases automatically, or fallback lease expires
- B eventually acquires the exclusive lock
- B recovers abandoned `in_flight`
- B retries the same operationId

---

# P0 — crash after server commit before client response

Test the difficult idempotency window:

1. OP1 becomes in_flight.
2. Server processes and commits OP1.
3. Client crashes before handling response.
4. IndexedDB still contains OP1 in_flight.
5. Restart.
6. Locked-cycle recovery returns OP1 to retryable.
7. Retry sends SAME operationId.
8. Server recognizes `ProcessedSyncOperation`.
9. No financial side-effect is applied twice.
10. Client clears/reconciles OP1 normally.

Run this at least for:

- Sale CREATE or UPDATE
- Payment CREATE or UPDATE

---

# P0 — persistent regression tests

Extend `frontend/test-hsh-sync-client-integrity.ts`.

Add REAL fake-indexeddb tests for:

### Test A — crash before request completion

- queue OP1 update price20
- transition to in_flight
- simulate restart by closing/reopening DB or equivalent
- acquire/reproduce exclusive sync recovery context
- recover abandoned in_flight
- assert same operationId now retryable
- assert payload price20 unchanged

### Test B — recovered parent + successor

- OP1 in_flight price20
- OP2 pending price30 and depends on OP1
- simulate crash
- recover OP1
- process OP1 success revision6
- assert OP2 remains
- assert OP2.baseRevision == 6
- process OP2
- final canonical/latest intent price30

### Test C — server already committed

Use a controlled mock or actual backend test boundary:

- server has already processed OP1 operationId
- local OP1 remains abandoned in_flight
- recover + retry same operationId
- verify no duplicate effect

### Test D — healthy owner protection

If practical with the lock helpers:

- owner A holds sync lock with OP1 in_flight
- owner B attempts cycle
- B cannot run recovery until A releases/expires
- OP1 must not be reset by B during A's active lock

Do not replace these with source-string assertions.

---

# P1 — frontend test runner wiring

Current `frontend/package.json` has:

`"test:hsh-client": "tsx test-hsh-sync-client-integrity.ts"`

but a clean frontend environment may not have `tsx` locally.

Make `npm run test:hsh-client` work without relying on an accidental global install.

Preferred:

- add `tsx` as a frontend devDependency
- update lockfile normally

Do not use a global tool assumption.

After the fix:

`npm run test:hsh-client`

must work directly.

---

# Validation

Run exactly:

## Frontend

`npm run build`

`npm run lint`

`npx tsx test-hsh-regression.ts`

`npm run test:hsh-client`

## Backend

`npm run build`

`npm run test:hsh-sync`

Historical lint debt alone does not block release.

Report:

- build results
- exact test pass/fail counts
- lint error/warning count
- changed-file lint regressions if any

---

# Required final proof

Demonstrate this exact crash sequence:

1. persisted OP1 is pending
2. OP1 becomes in_flight
3. simulate process death
4. restart with same IndexedDB
5. before exclusive lock: do not mutate active foreign owner work
6. once exclusive lock acquired: abandoned OP1 recovered
7. same operationId retried
8. server had either:
   - not seen OP1: processes it once
   - already committed OP1: idempotently returns prior result
9. OP1 clears
10. successor remains/rebases
11. final user intent reaches server

---

# Freeze criteria

Return READY TO FREEZE = YES only if:

- abandoned `in_flight` cannot remain permanently stuck
- recovery occurs only under exclusive sync ownership
- healthy other-tab in-flight work is not reset
- recovered operation uses same operationId
- server-committed-before-crash retry is idempotent
- successor is preserved and rebased
- no duplicate financial effect
- `npm run test:hsh-client` works directly
- backend suite passes
- frontend sync suite passes
- Office/H.S.H regression suite passes
- frontend/backend builds pass
- 0 BLOCKER / 0 CRITICAL / 0 HIGH

Do not broaden scope.
Do not touch R.V.B.
