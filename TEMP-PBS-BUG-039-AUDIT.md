# TEMP-PBS-BUG-039-AUDIT.md

PBS-BUG-039 DEBUG CYCLE AUDIT — Possible concurrent race in unfinished-task name uniqueness.
Status at cycle start: NEEDS VERIFICATION. Date: 2026-09-28.
Workspace: C:/Users/islam/OneDrive/Desktop/poultry-business-suite.
Decision: CASE 2 — NOT A BUG. No production change. See sections 37-47.

## 1. Bug hypothesis

Two concurrent task CREATE sync operations (different task IDs, same trimmed unfinished-task name) may both pass the application-level duplicate check and both commit, because `task.name` has no database unique constraint and the check looks like non-atomic `find unfinished -> JS compare -> insert`.

## 2. Why status was NEEDS VERIFICATION

The static pattern IS read-then-insert and looks racy. But the sync engine runs every operation inside a MongoDB multi-document transaction (`session.withTransaction`) that also writes a shared global revision-counter document AFTER the duplicate read and BEFORE the task insert. A shared transactional write plus driver retry semantics can serialize the apparent race. Verification against the complete current transaction architecture was required before any index/mutex change.

## 3. Current task model

`H.S.H-V2.0.0/backend/src/models/task.model.ts` (71 lines, SHA-256 19716259DC1CE5E35ADD810C5A512CA1B53D6D57633C6DC7E637137CAA51851B, same as HEAD, zero cycle delta).
Fields: id (String, required, unique:true — the ONLY unique); createdAt (Number, required); updatedAt (Number, required); syncStatus (enum synced|pending|failed, required); lastSyncedAt (Number, optional); serverRevision (Number, optional); name (String, required — NO trim, NO lowercase, NO setter, NO unique, NO index); deadline (Number, required); status (String, enum ["pending","completed"], required:false, default "pending"); completedAt (Number, optional). Collection "tasks", versionKey false. No `schema.index(...)` calls. Unfinished states: "pending" plus missing/undefined status (default pending; helper treats anything !== "completed" as unfinished).

## 4. Actual Mongo task indexes

Real collection query in the Phase B harness (`TaskModel.collection.listIndexes().toArray()` on the isolated replica-set DB after model init + writes): `[{v:2,key:{_id:1},name:"_id_"},{v:2,key:{id:1},name:"id_1"}]` (unique `id_1` from schema autoIndex). Confirmed: NO name index, NO partial index, NO compound status index in the real database — Mongoose schema matches DB reality. Historical claim "no database unique constraint on name" is TRUE, but sections 13-16/29-32 prove it is not exploitable through the sync path.

## 5. Current duplicate-helper complete behavior

`isTaskNameDuplicateUnfinished(session, trimmedName, excludeId?)` (sync-service.ts lines 52-69):
`TaskModel.find({ status: { $ne: "completed" } }).session(session).lean()` — snapshot read inside the caller's transaction; then JS `.some()`: skip `excludeId` match; `String(t.name||"").trim() === trimmedName`; return boolean. Callers pre-trim (`rawName.trim()`, empty-string short-circuit). Reads ALL unfinished rows (no name predicate pushdown). Return: true = conflict.

## 6. Trim semantics

Proven by B3: stored name keeps original whitespace (`"  PBS039-TRIM  "` stored verbatim — no schema trim), while comparison trims both sides. `"  PBS039-TRIM  "` then `"PBS039-TRIM"` => second rejected TASK_NAME_DUPLICATE. B13 concurrent trim variant => exactly one survives. Trim semantics preserved, never modified.

## 7. Case semantics

Comparison is strict `===` on trimmed strings — case-SENSITIVE. B4 sequential `"PBS039-Case"` + `"pbs039-case"` => both OK. B14 concurrent case variant => both OK, dbCount=2. A case-insensitive constraint would be WRONG; none added.

## 8. Status / unfinished semantics

Unfinished = `status !== "completed"` (covers "pending" and missing status; `$ne` includes undefined). No other statuses exist in the enum. Completed tasks never conflict.

## 9. Completed-name reuse semantics

HARD requirement, proven by B5: create X (pending) -> complete X -> create X again => allowed (both creates OK). B15 concurrent double-create after a completed same-name task => exactly one new unfinished (one OK + one TASK_NAME_DUPLICATE, unfinishedCount=1). Restore/reschedule completed->unfinished re-checks (B6 rejected). Update/rename paths check with excludeId (B7 rejected).

## 10. Complete task write-path inventory

Backend-wide `TaskModel` references: sync-service.ts (direct helper import + generic CRUD via `model`), model-registry.ts (`task: TaskModel`), task.model.ts (definition). No HTTP route, service, or job writes tasks outside sync-service. Sync-service is the ONLY task writer (generic `model` dispatches through the same per-operation transaction). Matrix (all inside one `withTransaction` per operation): CREATE (dup check, no excludeId) -> getNextRevision -> insert + change + processed-op; UPSERT-missing (= create branch, dup check, no excludeId); UPSERT-existing (merged nextName/nextStatus, excludeId=self); UPDATE (merged name/status, excludeId=self, check on name-change/becoming-unfinished/payload-name); DELETE (no name check; completing is an update that releases the name). Every SUCCESS path calls `getNextRevision(session)` BEFORE the task write (CREATE L1916/1925, upsert-existing L2039/2049, upsert-missing L2166/2175, update L2382/2392, delete L2506/2511).

## 11. Duplicate-helper call-site matrix

| Call site | Op | Target | Resulting status | excludeId | Session | On duplicate |
| CREATE L1885 | create | missing | payload status (default pending) | none | txn | TASK_NAME_DUPLICATE, retryable:false, processed-op recorded, txn commits failure |
| UPSERT-existing L2030 | upsert | existing | merged nextStatus | self id | txn | same contract, only if willBeUnfinished && nextName |
| UPSERT-missing L2156 | upsert | missing | payload status | none | txn | same contract |
| UPDATE L2326 | update | existing | merged nextStatus | self id | txn | same contract, only if willBeUnfinished && nextName && (name-change \|\| becoming-unfinished \|\| name in payload) |

## 12. Sync route/call stack

`POST /api/sync` (routes/sync.ts): validates operations array (entity/operation/opId/createdAt, registered entity) -> `processSyncOperations(ops)` -> SEQUENTIAL `processSyncOperation(op)` per operation (sync-service.ts L2617-2625; one transaction each, NOT one batch transaction) -> `POST /` responds per-operation results. Thin route: no shared state, no concurrency relevance — Phase B calls `processSyncOperation` directly (identical transaction path; route adds nothing).

## 13. Exact transaction boundary

Per operation: `mongoose.startSession()` (L1758) -> `session.withTransaction(callback)` (L1761) -> inside: idempotency re-check (processed-op lookup) -> op-type branch: [entity pre-checks -> existing lookup -> TASK dup check (read) -> business handlers (non-task entities) -> `getNextRevision(session)` (SHARED counter write) -> task insert/update + SyncChange insert + ProcessedSyncOperation insert] -> commit (callback returns `result`) -> outer returns result; `endSession` in finally. Errors: E11000-task-name impossible today (no index); any throw -> catch maps incomingInvoice E11000 only, `isTransientError` classification, terminal failures recorded to processed-ops (non-transactionally), transient returned as `retryable:true` for client retry (same opId => idempotent replay).

## 14. Shared revision/state writes

EVERY successful sync operation (any entity) executes `getNextRevision(session)` (L34-50): `SyncCounterModel.findOneAndUpdate({name:"global"}, {$inc:{revision:1}}, {upsert,new,setDefaultsOnInsert,session})` — a write to ONE shared document inside the same transaction, positioned AFTER the duplicate read and BEFORE the task insert. SyncChange + ProcessedSyncOperation inserts are per-operation documents (no cross-txn contention). The counter document is the single serialization point.

## 15. Transaction contention analysis

Two concurrent same-name CREATEs: both snapshot-read tasks (both see no duplicate — first reads overlap) -> both `findOneAndUpdate` the SAME counter document -> WiredTiger write conflict: loser blocks then aborts with WriteConflict (TransientTransactionError) -> driver `withTransaction` re-runs the loser callback from the beginning with a FRESH snapshot -> re-read now sees the winner's committed task -> TASK_NAME_DUPLICATE (stable contract, retryable:false). Winner commits exactly once. The shared write is deliberately AFTER the check and BEFORE the insert, closing the check-to-commit gap for every success path (section 10). Same logic covers upsert/update/rename/restore races (all allocate revision before writing).

## 16. Driver/Mongoose retry semantics

Installed: mongoose ^9.9.3, mongodb driver ^7.5.0 (package.json). `session.withTransaction()` (mongodb driver): retries the transaction CALLBACK on TransientTransactionError (WriteConflict carries this label) until success or timeout; retries COMMIT on UnknownTransactionCommitResult. No production outer retry loop exists (outer catch only classifies; client retries by opId with idempotency). `isTransientError` (L71-104) returns true for WriteConflict/TransientTransactionError/Network/NoSuchTransaction and FALSE for duplicates/validation — consistent: conflict retries happen inside withTransaction; business duplicates never retry.

## 17. Operation idempotency behavior

ProcessedSyncOperation keyed by operationId, re-checked INSIDE the transaction (L1763). All concurrency tests used distinct operationIds + distinct task IDs per request (only the name shared), so idempotency could not mask the race. Replays with the same opId return the recorded result ("Already processed").

## 18. Sync batch semantics

`processSyncOperations` runs operations SEQUENTIALLY, each in its OWN transaction (L2621-2623). Same-batch same-name creates are therefore serialized by construction: B12 => first OK, second TASK_NAME_DUPLICATE, dbCount=1. The filed race concerns concurrent independent operations (separate transactions); both forms verified.

## 19. Existing task-data duplicate audit

Isolated test DB: initial unfinished-name groups EMPTY (`[]`). Post-run states: every round audited by `countDocuments({name, status:{$ne:completed}})`; ZERO rounds with count>1 (B9 dupPairs=0 across 50 rounds; B8/B10/B12/B13/B15 counts all 1 where applicable). Atlas/dev data NEVER touched (.env points to a remote Atlas cluster; connecting was deemed unsafe and unnecessary — the invariant is proven on the real code path with isolated data). No existing-data migration question arises; no data was created outside the throwaway in-memory replica set.

## 20. Atomic-index feasibility analysis

Evaluated, NOT implemented (CASE 2 needs no index): plain `unique:true` on name REJECTED (would break B5 completed reuse). Compound `{name,status}` REJECTED (allows pending+in_progress style splits conceptually; and status set here is binary but the helper's `$ne:completed` predicate covers missing status, which compound-key null-handling would complicate). Partial unique on name with `partialFilterExpression:{status:{$ne:"completed"}}` is expressible in modern Mongo BUT unnecessary: the transaction+counter+retry system already provides exactly-once semantics with the stable TASK_NAME_DUPLICATE contract (no E11000 mapping, no migration, no spoofable derived key, no multi-writer maintenance). A derived `activeNameKey` design was sketched in-spec but rejected as over-engineering for a disproven race (adds write-path maintenance across 4 branches + spoofing surface + index bootstrap risk for zero behavioral gain).

## 21. Runtime environment

Windows win32, Node 22, backend tsx harness, mongodb-memory-server MongoMemoryReplSet (replica set, REAL transactions), mongoose 9.9.3 / mongodb driver 7.5.0 (installed package.json ranges), real `processSyncOperation`/`processSyncOperations` (no HTTP layer; route is a thin pass-through, section 12), real model indexes (autoIndex `id_1`), disposable driver-level attempt tracing (prototype wrapper + AsyncLocalStorage attribution, test-only, production untouched, transactions never disabled).

## 22. B1 single-create control

id=PBS039-A name="PBS039-RACE" => OK. Stored `{name:"PBS039-RACE", status:"pending"}` (default applied). PASS.

## 23. B2 sequential duplicate

id=PBS039-B same name => FAIL `TASK_NAME_DUPLICATE`, retryable=false. Ordinary semantics correct. PASS.

## 24. B3 trim control

`"  PBS039-TRIM  "` OK (stored VERBATIM with spaces — no schema trim), then `"PBS039-TRIM"` => TASK_NAME_DUPLICATE. Trim-compare proven; stored-name behavior recorded. PASS.

## 25. B4 case control

`"PBS039-Case"` OK + `"pbs039-case"` OK (both allowed, case-sensitive). PASS.

## 26. B5 completed reuse

Create X (pending) OK -> complete X OK -> create X again OK. HARD requirement holds. PASS.

## 27. B6 restore conflict

Completed C named X + unfinished D named X -> restore C to pending => TASK_NAME_DUPLICATE. PASS.

## 28. B7 rename conflict

Unfinished A="PBS039-ALPHA", B="PBS039-BEETA" -> rename B to "  PBS039-ALPHA " => TASK_NAME_DUPLICATE. PASS.

## 29. B8 concurrent two-request test

Clean collection, distinct opIds/task IDs, same name, `Promise.all`: A=OK, B=TASK_NAME_DUPLICATE(retryable:false), dbCount=1, 26ms. No dual success. (Per-op attempt attribution in this run aliased by a shared-global test tag — see B11 rerun for exact counts.)

## 30. B9 repeated concurrency statistics

50 isolated rounds, distinct IDs, per-round unique name: oneOK/oneDUP=50, bothOK=0, bothFail=0, transient/other=0, dupPairs=0. Every round exactly one winner with the stable duplicate contract. No flooding (one summary line).

## 31. B10 fan-out concurrency

12 concurrent same-name creates: ok=1, dup=11 (all TASK_NAME_DUPLICATE), other=[], dbCount=1, maxAttempts=23 (heavy contention exercised). Exactly ONE unfinished task survives. PASS.

## 32. B11 transaction attempt/retry trace

Method: test-only `ClientSession.prototype.withTransaction` wrapper counting callback executions (production untouched). First run (global tag): 71 tagged ops, 58 with >1 attempt, max 23 — proves mass contention/retry but aliases concurrent tags. Focused rerun with AsyncLocalStorage exact attribution: B8-exact winner 5 attempts / loser 5 attempts -> loser TASK_NAME_DUPLICATE, db=1; B10-exact ok=1, db=1, per-op attempts [2,2,2,3,2,2,3,2,1,3,2,2]. CONCLUSION: both transactions initially overlap (multiple attempts each), the shared-counter write conflicts, the driver retries the loser callback from the start, the retried duplicate helper observes the committed winner. Direct proof of the section-15 mechanism.

## 33. B12 same-batch duplicate

`processSyncOperations([create SB1 name X, create SB2 name X])` => OK then TASK_NAME_DUPLICATE, dbCount=1 (sequential transactions, no race possible). Intended behavior retained. PASS.

## 34. B13 concurrent trim variant

`"  PBS039-T  "` vs `"PBS039-T"` concurrently => one OK + one TASK_NAME_DUPLICATE, dbCount=1. PASS.

## 35. B14 case variant

`"PBS039-CV"` vs `"pbs039-cv"` concurrently => both OK, dbCount=2 (intentional case-sensitive semantics, NOT a violation). Guards against a future case-insensitive "fix". PASS.

## 36. B15 completed reuse concurrency

Completed CU0="PBS039-CU", then concurrent CU1+CU2 same name => one OK + one TASK_NAME_DUPLICATE, unfinishedCount=1. Reuse is a real independent operation, race-free. PASS.

## 37. Decision gate

CASE 2 — NO DUPLICATES, AND TRANSACTION SERIALIZATION/RETRY IS PROVEN. Zero runs left >1 unfinished task with the same trimmed case-sensitive name (50 two-request rounds + 12-fanout + trim/case/batch variants + all sequential controls). Serialization proven by: (a) static write ordering (dup-read -> shared-counter write -> task write -> commit on EVERY success path); (b) exact attempt traces showing overlapped transactions, counter contention, driver callback retry, and losers returning the stable duplicate contract; (c) final DB counts of exactly 1 in every same-name concurrency test.

## 38. Exact runtime conclusion

PBS-BUG-039 as filed (concurrent CREATE race defeating the application check) DOES NOT REPRODUCE through the real sync path with real Mongo transactions. The read-then-insert pattern is enclosed in a transaction that always writes a single shared counter document between the check and the insert; concurrent transactions conflict there, and the driver's `withTransaction` retry re-executes the loser against a fresh snapshot containing the winner. Giorno should REJECT PBS-BUG-039 — NOT A BUG. No production change applied.

## 39. Why apparent read-then-insert is actually serialized

Single-transaction enclosure per operation + mandatory shared write (`sync-counters {name:"global"}` `$inc`) positioned after every duplicate read and before every task mutation + WiredTiger write-conflict on that document + driver-level callback retry with fresh snapshot. The check-to-commit gap is closed not by a uniqueness index but by optimistic-concurrency serialization on the revision allocator that every successful sync operation must touch.

## 40. Proof no permanent source change is needed

Static: sections 10-16 (write matrix, call sites, boundary, counter ordering, retry semantics, idempotency isolation). Runtime: B1-B15 (controls correct; 50/50 serialized rounds; fan-out 12->1; exact retry attribution; batch sequential). Any added index/mutex would change nothing observable except deployment risk (E11000 mapping surface, migration audit, multi-instance mutex invalidity). Therefore zero production edits is the correct engineering outcome.

## 41. Current source/index hashes

sync-service.ts SHA-256 05F0C12FC7E93429843FA916C3F091A2E7F6A1C446DB90CF72AC9DD9FDD5A49F (snapshot-matched, same as HEAD). task.model.ts SHA-256 19716259DC1CE5E35ADD810C5A512CA1B53D6D57633C6DC7E637137CAA51851B (snapshot-matched, same as HEAD). Real tasks indexes: `_id_`, `id_1` only. Cycle snapshots stored pre-work in TEMP-PBS-BUG-039-BEFORE (deleted after capture per cleanup; hashes recorded here).

## 42. TypeScript

backend `npx tsc --noEmit` exit 0 (post-verification, no source changes). PASS.

## 43. sync 34/34

`npm run test:hsh-sync`: 34 passed, 0 failed (this cycle). PASS.

## 44. git/status proof

`git status --short` (post-cleanup): `M H.S.H-V2.0.0/frontend/app/notifications/page.tsx` (accepted 038-rev2, preserved, untouched by this cycle), `D TEMP-PBS-BUG-038-AUDIT.md` (deleted per 039 start-of-cycle spec). `git diff --name-only`: those two entries only. `git diff --check`: clean. Backend tree: zero modifications (`git diff --quiet` clean for both candidate files at snapshot and at close). PBS-BUG-040: no files touched anywhere outside the two listed entries; nothing 040-related modified.

## 45. cleanup

Deleted after evidence capture: TEMP-PBS-BUG-039-BEFORE/, backend/tmp-pbs039-phaseb.ts, backend/tmp-pbs039-b11.ts. Kept: TEMP-PBS-BUG-039-AUDIT.md (this file). No generated logs retained (mongoose deprecation warnings were console noise only). No 040 work started.

## 46. remaining uncertainty

(a) Concurrency was proven on a single-node in-memory replica set; multi-shard deployments could theoretically alter conflict behavior, but the current deployment contract (single replica set, unique `id` index present) matches the test topology, and the serialization argument relies only on single-document linearizability + driver retry, both topology-independent for replica sets. (b) Attempt attribution in the first harness aliased concurrent tags (shared global); corrected exactly via AsyncLocalStorage rerun — numbers cited are from the corrected run. (c) HTTP-layer concurrency was not separately load-tested; the route is a validated thin wrapper around the tested function with no shared state, so no distinct race surface exists there.

## 47. final status = NOT FIXED

No production fix applied: verification disproved the bug (CASE 2). Giorno disposition requested: REJECT PBS-BUG-039 as NOT A BUG.

NOT FIXED
