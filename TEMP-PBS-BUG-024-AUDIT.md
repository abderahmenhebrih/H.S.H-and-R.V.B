# TEMP-PBS-BUG-024-AUDIT -- payment sync validation omits `entityType` requirement

Status: **FIXED -- READY FOR GIORNO REVIEW** (see section 31).
Bug remains open -- only Giorno can close it.

Date (UTC): 2026-09-27.
Workspace: `C:\Users\islam\OneDrive\Desktop\poultry-business-suite`
Runtime under test: backend `tsx` + `mongoose 9.9.3` + `mongodb-memory-server 11.3.0`
(single-node replica set, transactions live), driving the REAL exported
`processSyncOperation()` with REAL Mongoose models. No core mocks. Node v22.

START-OF-CYCLE CLEANUP (PBS-BUG-023 is CLOSED):
- Deleted `TEMP-PBS-BUG-023-AUDIT.md` (was committed; now shows as `D`).
- No `tmp-pbs023` remnants existed (removed in-cycle); nothing else removed.
- The permanent PBS-BUG-023 notification guards (7 markers: helper + 4 guards +
  delete payload + feed rule) were NOT reverted -- verified intact in final checks.

---

## 1. Bug definition

PBS-BUG-024 (CONFIRMED at runtime): payment create/upsert validation
(`validateHshPayload` payment branch) required amount/date/entityId/accountId but
NOT `entityType` (validated only if provided). A payment omitting `entityType`
therefore survived the intended validation layer and failed later under a different
contract: `PAYMENT_TYPE_INVALID` from `handlePaymentCreate`'s else-branch on the
create path, and RAW Mongoose text
(`Payment validation failed: entityType: Path 'entityType' is required.`) from
`model.create` on the upsert-create path. Validation-contract instability with
schema leakage -- no write ever survived (atomic rollback in all cases), as the
narrowed impact statement predicted.

## 2. Current Payment validation contract

`validateHshPayload` payment branch (L961-989), per operation:
- create/upsert REQUIRE: amount, date, entityId (non-empty), accountId (non-empty).
  Codes: `PAYMENT_AMOUNT_REQUIRED`, `PAYMENT_DATE_REQUIRED`, `PAYMENT_ENTITY_INVALID`,
  `PAYMENT_ACCOUNT_INVALID` (note: missing strings use INVALID, not REQUIRED).
- update: NO required fields (partial updates legitimate); every provided field
  validated (amount>0 finite, date finite, non-empty ids, entityType-if-present).
- entityType (all ops): checked ONLY when not undefined/null -- must be non-empty
  and in `[supplier, customer, worker, expense]`, else `PAYMENT_TYPE_INVALID`.
  No `PAYMENT_TYPE_REQUIRED` code existed anywhere (verified by grep).
- Generic NaN/Infinity sweep applies on top; delete ops carry no payment validation.

## 3. Operation-by-operation validation map

- CREATE: amount/date/entityId/accountId mandatory; entityType optional-at-validation
  (BUG) -> handler/model decide later.
- UPSERT (pre-fix): same mandatory set (isCreateUpsert); entityType optional (BUG
  for missing-target; harmless for existing-target via candidate inheritance).
- UPDATE: fully partial-capable; omission of entityType VALID by design (candidate
  `{...existing, ...payload}` inherits stored type; `handlePaymentUpdate` re-derives
  from candidate). Must be preserved -- F8/F9 prove it is.
- DELETE: no payment field validation (generic idempotent path); untouched.

## 4. Payment handler trace (A2)

`handlePaymentCreate` (L378-442): `entityType = String(payload.entityType)` ("undefined"
when missing) -> account lookup (no writes) -> four directional branches
(supplier outgoing / customer incoming / worker outgoing+active-check / expense
bank-only) -> fallthrough `else return "PAYMENT_TYPE_INVALID"` (L440). Missing
entityType therefore fails AFTER the account read but BEFORE any mutation -- clean
abort, wrong layer. `handlePaymentUpdate` (L700+): merges candidate FIRST, so
omission is correct and functional there (B7 proves success with retained type).

## 5. Payment model contract (A3)

`payment.model.ts`: `entityType` String enum `[supplier, customer, worker, expense]`,
required, NO default; entityId/accountId/amount/date/id/createdAt/updatedAt/
syncStatus required. Strict default (strips unknowns). Missing entityType reaches
model validation ONLY via paths that skip handler coverage -- measured: upsert-missing
`model.create` rejects with raw `Payment validation failed: entityType: Path
'entityType' is required.` (B6). No model change made (rule 7 -- unneeded; the fix
stops omission before models).

## 6. Error-code inventory (A4)

- Omitted (create): `PAYMENT_TYPE_INVALID` via handler else (pre-fix). No validation
  code; no raw leak (handler catches it first).
- Omitted (upsert-create): RAW `Payment validation failed: entityType: Path
  'entityType' is required.` via model.create through the outer catch (pre-fix) --
  the schema leakage.
- `"invalid-type"`: `PAYMENT_TYPE_INVALID` via validator (both pre/post).
- `""`: pre-fix `PAYMENT_TYPE_INVALID` via validator present-check; post-fix
  `PAYMENT_TYPE_INVALID` via the new create gate (same code, earlier line).
- `null`: pre-fix `PAYMENT_TYPE_INVALID` via handler (null skips the validator
  present-check); post-fix `PAYMENT_TYPE_INVALID` at validation.
- Valid enum: success path (no code).
- Frontend coupling: grep proves NO `PAYMENT_TYPE_*`/`PAYMENT_ENTITY_*` references
  anywhere in frontend src -- code choice is backend-internal.

## 7. Frontend/producer analysis (A6)

`frontend/src/services/operations/payment.operation.ts`: `entityType` is a required
typed input (`entityType: Payment["entityType"]`), always forwarded
(`entityType: input.entityType`, L177) after directional validation. Current clients
ALWAYS send it (B5/F7 writer control confirms numeric-valid canonical flow). Only
legacy/direct sync callers can omit it. No frontend modified (zero frontend files
in diff).

## 8. Baseline runtime environment (Phase B)

Disposable `backend/tmp-pbs024-baseline.ts` (deleted after the cycle;
`PBS024_MODE=baseline|postfix`): memory replset + real `processSyncOperation` +
real models. Fixtures per case (unique ids): bank account (1000), supplier (500) /
customer (500) / worker (active, 500) / expense; canonical supplier item
`{entityType, entityId, accountId, amount:100, date}` (supplier outgoing: bank
900/supplier 400 on success). JSONL observations: result/error/message, payment
doc, all balances, per-entity change counts.

## 9. Valid create control (B1)

`{success:true, error:null}`, doc `{supplier, SB1, AB1, 100}`, balances
acct 900/sup 400, 1 SyncChange. Locks the valid baseline (F1 identical post-fix).

## 10. Missing entityType create reproduction (B2)

Identical payload minus `entityType`: validation ACCEPTS (no payment code);
`handlePaymentCreate` else returns `PAYMENT_TYPE_INVALID` (error == message ==
that code); doc null; balances 1000/500 untouched; 0 changes. Core reproduction:
omission survives the validation boundary and fails one layer late. (No partial
writes -- handler mutates nothing before its else.)

## 11. Invalid/empty/null results (B3/B4)

- `"invalid-type"`: `PAYMENT_TYPE_INVALID` (validator). The intended invalid-enum
  contract -- preserved exactly post-fix (F3).
- `""`: `PAYMENT_TYPE_INVALID` (validator present-check).
- `null`: `PAYMENT_TYPE_INVALID` (handler else -- null skips validator check).
  Three shapes, three paths, one code by accident -- post-fix all three resolve at
  the validator with the same code (F4/F5).

## 12. Upsert-create behavior (B5/B6)

- B5 canonical upsert-missing: success, doc persisted. (Observed: NO balance side
  effects -- generic upsert-missing path persists without business handlers;
  pre-existing architecture, out of scope, documented neutrally.)
- B6 missing upsert-missing: validation ACCEPTS; `model.create` rejects with RAW
  `Payment validation failed: entityType: Path 'entityType' is required.`
  (error == message == raw text); doc null; balances untouched; 0 changes.
  Schema leakage confirmed -- the sharpest half of the bug.

## 13. Existing update behavior (B7)

Valid payment created, then `update {amount:50, date}` (entityType omitted):
SUCCESS; doc `{supplier, amount:50}` (type retained via candidate merge; balances
950/450 = reversal + re-apply, correct); proves partial-update omission is
legitimate TODAY and must survive (F8).

## 14. Existing upsert behavior (B8)

Valid payment created, then `upsert {amount:60, date, entityId, accountId}` (no
entityType): SUCCESS via candidate inheritance + generic `$set`; doc type retained
(amount 60). Upsert-existing partials are legitimate TODAY and must survive (F9) --
this is why the fix is create-scoped, never a blanket upsert requirement.

## 15. Atomicity evidence (B9)

Every failing case (B2/B3/B4/B6): payment doc absent, all balances byte-identical,
zero SyncChanges for the payment id; only the architecture's terminal failure
record exists. No write ever survived omission -- impact is contract instability +
schema leakage, never corruption (as narrowed pre-cycle).

## 16. Exact root cause

The payment validator requires every create-mandatory scalar EXCEPT `entityType`
(L968-973 requires amount/date/entityId/accountId; L984-987 checks entityType only
when present). Omission therefore flows to `handlePaymentCreate`, where
`String(undefined)` matches no directional branch and returns `PAYMENT_TYPE_INVALID`
(create path), or -- on upsert-missing, which bypasses business handlers straight
to `model.create` -- to a raw Mongoose `Path 'entityType' is required` rejection.
One missing presence check; two different late failure contracts.

## 17. Exact fix design (Phase C)

Two narrow gates, one shared code, zero new codes:

Gate 1 (validator, create-only) -- inside the payment branch after the
`isCreateUpsert` block:
`if (operation === "create" && !isNonEmptyString(entityTypeRaw)) return "PAYMENT_TYPE_INVALID";`
Gate 2 (upsert-missing flow, `} else {` branch before the invoice guard): for
`entity === "payment"`, re-run `validateHshPayload(entity, payload, "create")` and
reject with its code. Because every other create check already passed
deterministically under upsert rules, this adds EXACTLY the entityType requirement.

## 18. Why create/update/upsert semantics remain correct

- Create: omission now rejected at validation (was: handler/model). Present-valid
  and present-invalid paths untouched (same lines, same codes).
- Update (`operation === "update"`): Gate 1 does not apply (create-only); the
  present-check is unchanged; candidate merge still supplies stored entityType
  (F8 proves byte-parity with B7).
- Upsert-existing: L1567 pre-validation unchanged for upserts (partial payloads
  still pass); L1839 candidate validation inherits stored type (unchanged); Gate 2
  sits ONLY in the missing-target `else` branch, unreachable when a doc exists
  (F9 proves parity with B8).
- A blanket `isCreateUpsert` requirement was explicitly REJECTED: it would break
  B8/F9 legitimate partial upserts (proven working pre-fix).

## 19. Chosen error code and justification

`PAYMENT_TYPE_INVALID` for missing/blank/invalid alike. Justification: (a) it is
the branch's own convention for missing STRING fields (`PAYMENT_ENTITY_INVALID` /
`PAYMENT_ACCOUNT_INVALID` for missing entityId/accountId); (b) it preserves every
existing observable (B3/B4 codes unchanged; B2/B6 move to the same code they
already surfaced, only earlier and without raw text); (c) no new code means no new
consumer contract (and grep proves no frontend consumer exists to update);
(d) `PAYMENT_TYPE_REQUIRED` was considered (parallels AMOUNT/DATE_REQUIRED) but
rejected -- those are numerics, while every string ref in this branch uses INVALID,
and REQUIRED would churn the `""` observable for zero diagnostic gain.

## 20. Permanent files changed

Exactly ONE: `H.S.H-V2.0.0/backend/src/sync/sync-service.ts` (+23/-0, two hunks).

## 21. FULL BEFORE code for every modified permanent file

Only `backend/src/sync/sync-service.ts` (+23/-0). BEFORE region 1 (payment branch,
post-`isCreateUpsert` block): the `if (amountRaw !== ...)` finite-amount check
followed IMMEDIATELY -- no entityType presence requirement existed. BEFORE region 2
(upsert-missing `} else {` branch): the `if (operation.entity === "invoice") {`
guard followed IMMEDIATELY -- no payment completeness re-check existed.

## 22. FULL AFTER code for every modified permanent file + complete unified diff

AFTER region 1 (8 added lines): the Gate-1 comment + `if (operation === "create" &&
!isNonEmptyString(entityTypeRaw)) return "PAYMENT_TYPE_INVALID";` exactly as in the
diff below. AFTER region 2 (15 added lines): the Gate-2 comment + payment-gated
create-level re-validation block exactly as in the diff below.

Complete unified diff (literal, verified line-exact):

```diff
diff --git a/H.S.H-V2.0.0/backend/src/sync/sync-service.ts b/H.S.H-V2.0.0/backend/src/sync/sync-service.ts
index 9b660a5..ff0a4ab 100644
--- a/H.S.H-V2.0.0/backend/src/sync/sync-service.ts
+++ b/H.S.H-V2.0.0/backend/src/sync/sync-service.ts
@@ -971,6 +971,14 @@ export function validateHshPayload(
         if (!isNonEmptyString(entityIdRaw)) return "PAYMENT_ENTITY_INVALID";
         if (!isNonEmptyString(accountIdRaw)) return "PAYMENT_ACCOUNT_INVALID";
       }
+      // PBS-BUG-024: creating a payment requires entityType up front, using the
+      // same PAYMENT_TYPE_INVALID code as the present-but-invalid path below
+      // (consistent with missing entityId/accountId above). Omission is therefore
+      // decided at the validation layer instead of leaking to the handler
+      // (String(undefined)) or Mongoose model text. Create-only: partial updates
+      // and upsert-existing inherit the stored entityType via candidate merge
+      // and must keep working, so this is never a blanket requirement.
+      if (operation === "create" && !isNonEmptyString(entityTypeRaw)) return "PAYMENT_TYPE_INVALID";
       if (amountRaw !== undefined && amountRaw !== null) {
         const amount = toFiniteNumber(amountRaw);
         if (!Number.isFinite(amount) || amount <= 0) return "PAYMENT_AMOUNT_INVALID";
@@ -1980,6 +1988,21 @@ export async function processSyncOperation(
           };
           return;
         } else {
+          // PBS-BUG-024: upsert-missing behaves as create -- a payment persisted
+          // here needs a valid entityType before model validation can leak raw
+          // Mongoose text. Re-running create-level validation adds exactly that
+          // requirement (all other create checks already passed under upsert
+          // rules, deterministically). Upsert-existing is unaffected: it returns
+          // through the candidate-merge path above, which inherits the stored
+          // entityType.
+          if (operation.entity === "payment") {
+            const createErr = validateHshPayload(operation.entity, payload as Record<string, unknown>, "create");
+            if (createErr) {
+              await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: createErr, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
+              result = { operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, message: createErr, error: createErr, retryable: false };
+              return;
+            }
+          }
           if (operation.entity === "invoice") {
             const st2 = (payload as any).status;
             if (st2 && st2 !== "DRAFT") {
```

(All other ~2550 lines byte-identical to HEAD.)

## 23. Verification commands

From `H.S.H-V2.0.0/backend`:
1. Baseline: `npx tsx tmp-pbs024-baseline.ts` -> B1/B5/B7/B8 green; B2 handler-code,
   B3/B4 codes, B6 raw leak measured.
2. Post-fix: `$env:PBS024_MODE="postfix"; npx tsx tmp-pbs024-baseline.ts` -> F1-F10
   all green (section 24).
3. Existing suite: `npm run test:hsh-sync` -> `34 passed, 0 failed` (fix in place).
4. Typecheck: `npx tsc --noEmit` -> exit 0, no output.
5. Lint: backend ESLint NOT configured (no config/deps; re-confirmed) -- nothing.
6. Scope: `git diff --name-only` (repo root) -> sync-service.ts + prior-cycle audit
   deletion only.

## 24. Exact post-fix results

- F1: `{success:true, doc:{supplier,...100}, bal:{900,400}, changes:1}` (== B1).
- F2: `{success:false, error:PAYMENT_TYPE_INVALID, clean:true, doc:null,
  bal:{1000,500}, changes:0}` -- now decided at validation.
- F3/F4/F5 (invalid/empty/null): all `{success:false, error:PAYMENT_TYPE_INVALID,
  match:true, clean:true, doc:null}` -- ONE stable code, no raw text.
- F6: valid upsert-create success. F7: missing upsert-create
  `{success:false, error:PAYMENT_TYPE_INVALID, clean:true, doc:null, changes:0}`
  (was raw Mongoose text).
- F8: partial update `{success:true, doc:{supplier, amount:50}}` (== B7).
- F9: upsert-existing `{success:true, doc:{supplier, amount:60}}` (== B8).
- F10 validator: `{supplier:null, customer:null, worker:null, expense:null,
  missing:PAYMENT_TYPE_INVALID}`.
- F10 runtime: worker `{success, wBal 400, aBal 900}`; expense success;
  customer `{success, cBal 400, aBal 1100}` (incoming direction correct).
- Full JSONL captured in-session; disposable script removed afterwards.

## 25. Valid enum matrix (F10)

See section 24: all four model enum values pass validation (null = valid) and all
three non-trivial directions verified at runtime with exact balance math
(supplier/worker outgoing, customer incoming, expense bank-only). No enum added,
removed, or reordered.

## 26. Error-disclosure check (F13)

Every post-fix failure string matches `PAYMENT_TYPE_INVALID` exactly; automated
`noLeak` check (`/Path |required|Mongoose|validation failed/i`) passes on all
error+message pairs. No schema paths, enum internals, or model names leak. (The
word REQUIRED appears nowhere in payment failure output.)

## 27. Existing sync-suite result (F14)

`=== H.S.H sync integrity: 34 passed, 0 failed ===` with the 024 fix applied.

## 28. PBS-BUG-022/023 regression proof (F15)

- 022 block intact: `PBS-BUG-022` marker present (1 occurrence); diff hunks do not
  overlap L1437+ region. Weight-alias behavior covered by the still-green 34-case
  suite (sale/purchase cases within).
- 023 intact: all 7 `PBS-BUG-023` markers present (helper + 4 guards + delete
  payload + feed rule); no hunk overlaps those regions; helper/guard/feed code
  paths untouched by the payment-only hunks.
- No other entity branch touched (payment-only `entity ===` gates + payment-branch
  validator lines).

## 29. Diff-scope proof (F18)

`git diff --name-only` = `H.S.H-V2.0.0/backend/src/sync/sync-service.ts` (+23/-0)
+ `TEMP-PBS-BUG-023-AUDIT.md` (expected prior-cycle cleanup deletion). Untracked:
`TEMP-PBS-BUG-024-AUDIT.md` only. Zero frontend files. Zero model/schema files.

## 30. Remaining uncertainty

1. Upsert-missing for OTHER entities with their own required-field gaps is 025
   territory (explicitly not broadened); the Gate-2 pattern is payment-scoped only.
2. A legacy client that relied on the accidental B8-shaped success (upsert missing
   ONLY entityType... which actually FAILED pre-fix with raw text, so no working
   reliance could exist) -- none possible. LOW.
3. `""` moving validator-INVALID to gate-INVALID is the same code via an earlier
   line -- client-invisible. LOW.

## 31. Final status

FIXED -- READY FOR GIORNO REVIEW
