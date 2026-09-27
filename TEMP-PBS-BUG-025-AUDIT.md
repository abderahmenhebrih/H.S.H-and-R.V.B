# TEMP-PBS-BUG-025-AUDIT -- generic entity required-field validation boundary gaps

Status: **FIXED -- READY FOR GIORNO REVIEW** (see section 38).
Bug remains open -- only Giorno can close it.

Date (UTC): 2026-09-27.
Workspace: `C:\Users\islam\OneDrive\Desktop\poultry-business-suite`
Runtime under test: backend `tsx` + `mongoose 9.9.3` + `mongodb-memory-server 11.3.0`
(single-node replica set, transactions live), driving the REAL exported
`processSyncOperation()` (+ direct `validateHshPayload()` spot checks) with REAL
Mongoose models. No core mocks. Node v22.

START-OF-CYCLE CLEANUP (PBS-BUG-024 is CLOSED):
- Deleted `TEMP-PBS-BUG-024-AUDIT.md` (was committed; now shows as `D`).
- `tmp-pbs024-baseline.ts` was already removed in-cycle; no remnants found.
- The permanent PBS-BUG-024 payment gates (create-only entityType check +
  upsert-missing create-level re-validation) were NOT reverted -- verified intact
  in final checks (2 markers; behavior re-proven by the still-green 34-case suite).

---

## 1. Bug definition

PBS-BUG-025 (CONFIRMED at runtime, 27 omission cases): generic HSH sync entities
(product, customer, supplier, bankAccount, worker, vehicle) did not enforce their
Mongoose-required, client-owned fields at the `validateHshPayload()` boundary.
Missing fields survived validation and failed later with raw Mongoose text
(`<Model> validation failed: <field>: Path '<field>' is required.`), both on
create and on missing-target upsert. Error-contract instability + schema-detail
leakage; no write ever survived (atomic rollback in all 27 cases).

## 2. Affected-entity matrix

product, customer, supplier, bankAccount, worker, vehicle -- all six proven gapped
(section 22); sale/purchase/payment/transfer/expense/invoice/notification/task and
all other entities untouched (payment closed under 024; expense already gates
presence; incomingInvoice is 026).

## 3. Full model required-field matrix (A1)

Required:true per CURRENT schemas (`required:false`/defaults omitted for brevity;
server-owned id/createdAt/updatedAt/syncStatus/lastSyncedAt/serverRevision noted):

- product: name, price, quantity, weightKg (+description?, taxProfileId?).
- customer: name, phone, type, balance (+19 optional incl. address/email/notes/legal*.
  invoiceCustomerType default consumer).
- supplier: name, phone, balance (+address/identificationNumber/email/notes).
- bankAccount: type [cash,bank], name, initialBalance, balance (+notes?).
- worker: name, phone, employmentDate, position, startingSalary, monthlySalary,
  status [active,archived], balance (+address?, birthDate?, notes?).
- vehicle: name, registrationNumber, type (+image?, imageName?, notes?).

## 4. Client-owned vs server/defaulted field classification (A1)

Server-supplied by the sync path itself (toCreate adds/defaults; NEVER gated):
id (from entityId), createdAt/updatedAt (`?? Date.now()`), syncStatus
(`"synced"`), serverRevision, lastSyncedAt. Client MUST provide on create
(frontend writers verified to send each one -- section 7): product
name/price/quantity/weightKg; customer name/phone/type/balance (frontend always
balance:0); supplier name/phone/balance (always 0); bankAccount
type/name/initialBalance/balance (=initialBalance); worker
name/phone/employmentDate/position/startingSalary/monthlySalary/status
(always "active")/balance (=startingSalary); vehicle
name/registrationNumber/type. No defaults invented (rule 6); no schema changed
(rule: models untouched).

## 5. Current validator matrix (A2)

Pre-fix `validateHshPayload()` branches for the six entities: presence checks NONE
(zero `*_REQUIRED` codes existed for them); optional-if-present type/range checks
only -- product price/quantity/weight(`weightKg ?? weight`)/finite>=0
(`PRODUCT_*_INVALID`); customer/supplier balance finite (`*_BALANCE_INVALID`);
bankAccount initialBalance/balance finite (`BANK_ACCOUNT_BALANCE_INVALID`); worker
salaries>=0/balance/birth/employment dates (`WORKER_SALARY/BALANCE/DATE_INVALID`);
vehicle NOTHING (comment-only branch). Every omission therefore fell through to
Mongoose.

## 6. Operation-semantics map (A3)

- CREATE: L1567 `validateHshPayload(op=create)` pre-transaction; generic entities
  run NO business handler -- straight to `toCreate` + `model.create`. Missing field
  -> raw ValidationError via outer catch. PROVEN per entity (B1-B6 baselines).
- UPSERT missing target: L1567 with op=upsert (same if-present checks only) ->
  missing-target `else` branch -> `toCreate` + `model.create` -> SAME raw leak
  (B10 baseline; mirrors the 024 upsert-missing finding).
- UPSERT existing target: candidate merge exists ONLY for purchase/sale; generic
  entities go straight to `$set` + runValidators (validates only set paths) ->
  partial payloads succeed with stored values retained (B9 baseline all six).
- UPDATE existing: L1567 op=update (partial-capable) -> generic `$set` (non
  sale/purchase/payment/transfer) -> succeeds (B8 baseline all six).
- Timing: validation runs BEFORE any DB lookup for create/upsert/update; candidate
  merge (purchase/sale only) runs inside the transaction. Hence presence gates must
  be create-scoped (L1567-time) + upsert-missing-scoped (flow-time), never blanket.

## 7. Frontend producer matrix (A4)

Current writers always send every gated field (verified read-only): product
create validates name/price/quantity/weightKg client-side; customer/supplier send
name/phone/type + balance:0; bankAccount sends type/name/initialBalance(+balance);
worker sends name/phone/employmentDate/position/salaries + status:"active" +
balance:=startingSalary; vehicle sends name/plate/type (client-side non-empty +
dup checks). No frontend modified; F10 holds by construction + runtime parity.

## 8. Error-code convention inventory (A5)

Established pattern (expense branch = template): numerics missing ->
`EXPENSE_AMOUNT_REQUIRED`/`EXPENSE_DATE_REQUIRED` (`=== undefined || === null`);
strings missing/blank -> `EXPENSE_NAME_REQUIRED`/`EXPENSE_ACCOUNT_REQUIRED`
(`!isNonEmptyString`); present-but-bad -> `*_INVALID`. No REQUIRED codes existed
for the six entities (only `*_INVALID`/`*_NOT_FOUND`), so 24 new REQUIRED codes
were minted field-by-field in that exact style (section 25). No existing code
altered, none removed.

## 9. Late Mongoose error path (A6)

`processSyncOperation` -> L1567 validation passes -> `model.create([toCreate])`
inside `withTransaction` -> Mongoose ValidationError (`<Model> validation failed:
<field>: Path '<field>' is required.`) -> transaction aborts -> outer catch L2419+
returns raw `error.message` verbatim as error+message (only incomingInvoice E11000
is mapped) + terminal failure record. Raw schema text (model name, `validation
failed`, `Path`, field, `is required`) reaches the client -- measured verbatim in
all 27 baseline omissions (section 17).

## 10. Baseline environment (Phase B)

Disposable `backend/tmp-pbs025-baseline.ts` (deleted after the cycle;
`PBS025_MODE=baseline|postfix`): memory replset + real `processSyncOperation` +
real models, data-driven per-entity matrix (valid builder, omit list,
invalid-present probes, single-optional-field update/upsert payloads). Fresh ids
per case; JSONL observations (result/error/message, doc presence, per-id change
counts). One harness artifact found and fixed mid-cycle: reused vehicle plate
"ABC-1" tripped the backend's UNIQUE registrationNumber index (E11000) -- fixture
bug, not production; plates made unique and the full matrix re-run clean.

## 11-16. Per-entity results (B1-B6)

Valid create (B1): 6/6 success, docs present. Omission creates: 27/27 raw leaks of
the exact shape `<Model> validation failed: <field>: Path '<field>' is required.`
(doc absent, 0 changes) -- product name/price/quantity/weightKg; customer
name/phone/type/balance; supplier name/phone/balance; bankAccount
type/name/initialBalance/balance; worker
name/phone/employmentDate/position/startingSalary/monthlySalary/status/balance;
vehicle name/registrationNumber/type. Invalid-present controls:
`PRODUCT_PRICE_INVALID`, `CUSTOMER/SUPPLIER/BANK_ACCOUNT_BALANCE_INVALID`,
`WORKER_SALARY_INVALID` (must be preserved -- F3). Upsert-missing incomplete:
6/6 raw leaks (first field each). Partial update and partial upsert-existing: 12/12
success with stored values retained (must be preserved -- F4/F5).

## 17. Raw-error disclosure evidence (B7)

All 27 omission errors + 6 upsert-missing errors contain model name +
`validation failed` + ``Path `<field>` `` + `is required` verbatim (full texts in
run transcripts; e.g. `Product validation failed: name: Path 'name' is required.`).
Automated post-fix scan asserts absence of `Path`/`validation failed`/`Mongoose`/
`ValidationError` (section 33).

## 18-19. Partial-update / upsert-existing controls (B8/B9)

B8 (update changing one optional field, all requireds omitted): 6/6 success, doc
kept, change applied -- legitimate TODAY. B9 (upsert same partial shape): 6/6
success via candidate/`$set` inheritance -- legitimate TODAY. Both preserved
post-fix (F4/F5 all green), which is WHY presence gates are create-scoped plus a
missing-target-only upsert gate, never blanket (the 024 design, extended).

## 20. Upsert-missing controls (B10)

6/6 incomplete upsert-missing leak raw Mongoose text (first required field each).
Complete upsert-missing succeeds (6/6 baseline-implicit; F6-complete explicit
post-fix). The missing-target branch is the second required gate location.

## 21. Atomicity evidence (B11)

All 33 failing baseline cases (27 create + 6 upsert-missing): entity doc absent,
zero SyncChanges for the id, no related mutations possible on these paths (no
business handlers for generic entities); only the architecture's terminal failure
record exists. No write ever survived -- contract/leakage bug only.

## 22. Final confirmed field-gap matrix (Decision gate)

All 27 fields satisfy all five criteria (client-required on create per section 4
+ model-required per section 3 + no presence check per section 5 + late failure
measured per sections 11/20 + early check preserves semantics per sections 30-32):
product(4), customer(4), supplier(3), bankAccount(4), worker(8), vehicle(3).
Excluded per gate rules: all optional/defaulted fields, all server-owned fields
(id/createdAt/updatedAt/syncStatus/serverRevision/...), all already-checked
conditionals, and any update-only omission (inherited by design). No historical
overstatement found -- every listed entity/field reproduced.

## 23. Exact root cause

The six entity branches validate shape but never presence, while `model.create`
(validated late, inside the transaction) enforces presence -- and the outer catch
returns its raw text. Two unguarded ingress sub-paths: create (L1567-time) and
upsert-missing (flow-time toCreate).

## 24. Fix design (Phase C)

Gate 1 (validator, six branches): `if (operation === "create")` presence blocks --
strings via `!isNonEmptyString` (covers undefined/null/""/blank, expense style),
numerics via `=== undefined || === null` (preserving the existing if-present
finite checks for INVALID codes); product weight honors the `weightKg ?? weight`
alias. Gate 2 (upsert-missing `else` branch): extend the 024 payment gate to an
explicit 7-entity allowlist (`payment` + six) re-running
`validateHshPayload(entity, payload, "create")` -- deterministic delta limited to
the new presence gates (those branches contain no other create-vs-upsert-dependent
code), so upsert-existing partials (which return earlier via merge/`$set`) are
untouched. No generic introspection validator, no model changes, no defaults, no
new codes beyond the 24 field REQUIREDs, no touch to payment/notification/weight/
invoice/transfer/task/expense branches.

## 25. Error-code choices + justification

24 new `*_REQUIRED` codes, all field-specific in EXPENSE_*_REQUIRED style:
PRODUCT_NAME/PRICE/QUANTITY/WEIGHT_REQUIRED; CUSTOMER_NAME/PHONE/TYPE/BALANCE_REQUIRED;
SUPPLIER_NAME/PHONE/BALANCE_REQUIRED;
BANK_ACCOUNT_TYPE/NAME/INITIAL_BALANCE/BALANCE_REQUIRED; WORKER_NAME/PHONE/
EMPLOYMENT_DATE/POSITION/STARTING_SALARY/MONTHLY_SALARY/STATUS/BALANCE_REQUIRED;
VEHICLE_NAME/REGISTRATION/TYPE_REQUIRED. Justification: zero pre-existing REQUIRED
codes for these entities (only INVALID/NOT_FOUND); REQUIRED parallels the branch's
elsewhere-missing-field semantics (expense AMOUNT/DATE/ACCOUNT/NAME) and keeps
missing vs malformed distinct (INVALID codes byte-preserved, F3). No consumer
exists to update (frontend references no sync REQUIRED codes; verified by grep in
the 024 cycle for payments and by unchanged suite here).

## 26. Permanent files changed

Exactly ONE: `H.S.H-V2.0.0/backend/src/sync/sync-service.ts` (+73/-1: six Gate-1
blocks + Gate-2 allowlist extension; the single `-` line is the replaced 024
`if (operation.entity === "payment") {` condition).

## 27. FULL BEFORE code for every modified permanent file

Only `backend/src/sync/sync-service.ts` (+73/-1). BEFORE: the six branches held
only the if-present checks quoted in full in section 5 (product price/qty/weight/
balance reads + three finite blocks; customer/supplier balance-only; bankAccount
init/balance-only; worker salaries/balance/dates-only; vehicle comment-only), and
the upsert-missing branch gated create-level re-validation on
`if (operation.entity === "payment")` alone. No presence gate existed for any of
the six entities on any operation.

## 28. FULL AFTER code for every modified permanent file + complete unified diff

AFTER: the six Gate-1 `if (operation === "create")` presence blocks plus the
seven-entity Gate-2 allowlist, exactly as in the literal diff below (verified
line-exact against `git diff` in-session):

```diff
diff --git a/H.S.H-V2.0.0/backend/src/sync/sync-service.ts b/H.S.H-V2.0.0/backend/src/sync/sync-service.ts
index ff0a4ab..2dcd496 100644
--- a/H.S.H-V2.0.0/backend/src/sync/sync-service.ts
+++ b/H.S.H-V2.0.0/backend/src/sync/sync-service.ts
@@ -1022,10 +1022,20 @@ export function validateHshPayload(
       break;
     }
     case "product": {
+      const nameRaw: any = (payload as any).name;
       const priceRaw: any = (payload as any).price;
       const qtyRaw: any = (payload as any).quantity;
       const weightRaw: any = (payload as any).weightKg ?? (payload as any).weight;
       const balanceRaw: any = (payload as any).balance; // not used but generic
+      // PBS-BUG-025: creating a product requires its client-owned fields up front
+      // so omission is decided here instead of leaking raw Mongoose text later.
+      // Create-only: partial updates and upsert-existing inherit stored values.
+      if (operation === "create") {
+        if (!isNonEmptyString(nameRaw)) return "PRODUCT_NAME_REQUIRED";
+        if (priceRaw === undefined || priceRaw === null) return "PRODUCT_PRICE_REQUIRED";
+        if (qtyRaw === undefined || qtyRaw === null) return "PRODUCT_QUANTITY_REQUIRED";
+        if (weightRaw === undefined || weightRaw === null) return "PRODUCT_WEIGHT_REQUIRED";
+      }
       if (priceRaw !== undefined && priceRaw !== null) {
         const n = toFiniteNumber(priceRaw);
         if (!Number.isFinite(n) || n < 0) return "PRODUCT_PRICE_INVALID";
@@ -1043,7 +1053,19 @@ export function validateHshPayload(
     }
     case "customer":
     case "supplier": {
+      const nameRaw: any = (payload as any).name;
+      const phoneRaw: any = (payload as any).phone;
+      const typeRaw: any = (payload as any).type;
       const balanceRaw: any = (payload as any).balance;
+      // PBS-BUG-025: creating a customer/supplier requires its client-owned
+      // fields up front (same create-only scoping as product: partial updates
+      // and upsert-existing inherit stored values).
+      if (operation === "create") {
+        if (!isNonEmptyString(nameRaw)) return entity === "customer" ? "CUSTOMER_NAME_REQUIRED" : "SUPPLIER_NAME_REQUIRED";
+        if (!isNonEmptyString(phoneRaw)) return entity === "customer" ? "CUSTOMER_PHONE_REQUIRED" : "SUPPLIER_PHONE_REQUIRED";
+        if (entity === "customer" && !isNonEmptyString(typeRaw)) return "CUSTOMER_TYPE_REQUIRED";
+        if (balanceRaw === undefined || balanceRaw === null) return entity === "customer" ? "CUSTOMER_BALANCE_REQUIRED" : "SUPPLIER_BALANCE_REQUIRED";
+      }
       if (balanceRaw !== undefined && balanceRaw !== null) {
         const n = toFiniteNumber(balanceRaw);
         if (!Number.isFinite(n)) return entity === "customer" ? "CUSTOMER_BALANCE_INVALID" : "SUPPLIER_BALANCE_INVALID";
@@ -1051,8 +1073,19 @@ export function validateHshPayload(
       break;
     }
     case "bankAccount": {
+      const typeRaw: any = (payload as any).type;
+      const nameRaw: any = (payload as any).name;
       const initRaw: any = (payload as any).initialBalance;
       const balRaw: any = (payload as any).balance;
+      // PBS-BUG-025: creating a bank account requires its client-owned fields up
+      // front (create-only scoping: partial updates and upsert-existing inherit
+      // stored values).
+      if (operation === "create") {
+        if (!isNonEmptyString(typeRaw)) return "BANK_ACCOUNT_TYPE_REQUIRED";
+        if (!isNonEmptyString(nameRaw)) return "BANK_ACCOUNT_NAME_REQUIRED";
+        if (initRaw === undefined || initRaw === null) return "BANK_ACCOUNT_INITIAL_BALANCE_REQUIRED";
+        if (balRaw === undefined || balRaw === null) return "BANK_ACCOUNT_BALANCE_REQUIRED";
+      }
       if (initRaw !== undefined && initRaw !== null) {
         const n = toFiniteNumber(initRaw);
         if (!Number.isFinite(n)) return "BANK_ACCOUNT_BALANCE_INVALID";
@@ -1064,11 +1097,28 @@ export function validateHshPayload(
       break;
     }
     case "worker": {
+      const nameRaw: any = (payload as any).name;
+      const phoneRaw: any = (payload as any).phone;
+      const positionRaw: any = (payload as any).position;
+      const statusRaw: any = (payload as any).status;
       const startRaw: any = (payload as any).startingSalary;
       const monthlyRaw: any = (payload as any).monthlySalary;
       const balRaw: any = (payload as any).balance;
       const birthRaw: any = (payload as any).birthDate;
       const empRaw: any = (payload as any).employmentDate;
+      // PBS-BUG-025: creating a worker requires its client-owned fields up front
+      // (create-only scoping: partial updates and upsert-existing inherit
+      // stored values).
+      if (operation === "create") {
+        if (!isNonEmptyString(nameRaw)) return "WORKER_NAME_REQUIRED";
+        if (!isNonEmptyString(phoneRaw)) return "WORKER_PHONE_REQUIRED";
+        if (!isNonEmptyString(positionRaw)) return "WORKER_POSITION_REQUIRED";
+        if (!isNonEmptyString(statusRaw)) return "WORKER_STATUS_REQUIRED";
+        if (empRaw === undefined || empRaw === null) return "WORKER_EMPLOYMENT_DATE_REQUIRED";
+        if (startRaw === undefined || startRaw === null) return "WORKER_STARTING_SALARY_REQUIRED";
+        if (monthlyRaw === undefined || monthlyRaw === null) return "WORKER_MONTHLY_SALARY_REQUIRED";
+        if (balRaw === undefined || balRaw === null) return "WORKER_BALANCE_REQUIRED";
+      }
       if (startRaw !== undefined && startRaw !== null) {
         const n = toFiniteNumber(startRaw);
         if (!Number.isFinite(n) || n < 0) return "WORKER_SALARY_INVALID";
@@ -1093,6 +1143,14 @@ export function validateHshPayload(
     }
     case "vehicle": {
       // No numeric business invariants beyond generic finite check; payload mainly strings
+      // PBS-BUG-025: creating a vehicle still requires its client-owned identity
+      // fields up front (create-only scoping: partial updates and
+      // upsert-existing inherit stored values).
+      if (operation === "create") {
+        if (!isNonEmptyString((payload as any).name)) return "VEHICLE_NAME_REQUIRED";
+        if (!isNonEmptyString((payload as any).registrationNumber)) return "VEHICLE_REGISTRATION_REQUIRED";
+        if (!isNonEmptyString((payload as any).type)) return "VEHICLE_TYPE_REQUIRED";
+      }
       break;
     }
     case "incomingInvoice": {
@@ -1995,7 +2053,21 @@ export async function processSyncOperation(
           // rules, deterministically). Upsert-existing is unaffected: it returns
           // through the candidate-merge path above, which inherits the stored
           // entityType.
-          if (operation.entity === "payment") {
+          // PBS-BUG-025: same upsert-missing reasoning for the generic entities
+          // with create-level presence gates (product, customer, supplier,
+          // bankAccount, worker, vehicle). Their branches contain no
+          // create-vs-upsert-dependent checks besides the new presence gates,
+          // so re-running as "create" adds exactly those requirements.
+          // incomingInvoice (026) and all other entities are untouched.
+          if (
+            operation.entity === "payment" ||
+            operation.entity === "product" ||
+            operation.entity === "customer" ||
+            operation.entity === "supplier" ||
+            operation.entity === "bankAccount" ||
+            operation.entity === "worker" ||
+            operation.entity === "vehicle"
+          ) {
             const createErr = validateHshPayload(operation.entity, payload as Record<string, unknown>, "create");
             if (createErr) {
               await ProcessedSyncOperationModel.create([{ operationId: opId, entity: operation.entity, entityId: operation.entityId, operation: operation.operation, success: false, error: createErr, retryable: false, processedAt: new Date(), clientId: operation.clientId }], { session });
```

(All other ~2570 lines byte-identical to HEAD.)

## 29. Verification commands

From `H.S.H-V2.0.0/backend`:
1. Baseline: `npx tsx tmp-pbs025-baseline.ts` -> B1 green; 27 raw leaks; invalid
   codes; B8/B9 partials green (plus harness plate-uniqueness fix documented).
2. Post-fix: `$env:PBS025_MODE="postfix"; npx tsx tmp-pbs025-baseline.ts` -> F1-F6
   all green (section 30).
3. Existing suite: `npm run test:hsh-sync` -> `34 passed, 0 failed` (fix in place).
4. Typecheck: `npx tsc --noEmit` -> exit 0, no output.
5. Lint: backend ESLint NOT configured (no config/deps; re-confirmed) -- nothing.
6. Scope: `git diff --name-only` (repo root) -> sync-service.ts + prior-cycle audit
   deletion only.

## 30. Exact post-fix field matrix

- F1: 6/6 valid creates succeed, docs present.
- F2: 27/27 omissions -> exact expected REQUIRED codes (`match:true`),
  `clean:true` (no Path/validation-failed/Mongoose/ValidationError), doc absent,
  0 changes. Full map: PRODUCT x4, CUSTOMER x4, SUPPLIER x3, BANK_ACCOUNT x4,
  WORKER x8, VEHICLE x3 (section 22 codes).
- F3: invalid-present parity -- `PRODUCT_PRICE_INVALID`,
  `CUSTOMER/SUPPLIER/BANK_ACCOUNT_BALANCE_INVALID`, `WORKER_SALARY_INVALID`
  (byte-identical to baseline).
- F6: 6/6 complete upsert-missing succeed; 6/6 incomplete -> SAME create code as
  F2 (`match:true`), clean, no doc, 0 changes.
- VSPOT direct validator: missing product -> `PRODUCT_NAME_REQUIRED`; complete ->
  null.
- Full JSONL captured in-session; disposable script removed afterwards.

## 31. Partial-update regression results (F4)

6/6 partial updates (single optional field, all requireds omitted) succeed with
stored values retained and the change applied -- byte-parity with B8 baseline.

## 32. Upsert regression results (F5/F6)

F5: 6/6 partial upsert-existing succeed with stored values retained (parity with
B9). F6: complete upsert-missing succeeds; incomplete rejected with create codes.
The Gate-2 allowlist affects ONLY the missing-target branch (verified by F5/F6
coexistence on identical partial shapes).

## 33. Error-disclosure scan (F7)

Automated `clean` check (`/Path |validation failed|Mongoose|ValidationError/i`)
passes on all 27 F2 + 6 F6 error/message pairs. New codes are bare
`ENTITY_FIELD_REQUIRED` protocol tokens disclosing only the already-public field
name. No schema paths, enum internals, or model names leak.

## 34. Existing sync-suite result (F11)

`=== H.S.H sync integrity: 34 passed, 0 failed ===` with the 025 fix applied.

## 35. 022/023/024 regression proof (F14)

- Markers present: 022 x1, 023 x7, 024 x2 (10 total, counted) -- all intact.
- No hunk overlaps those regions (025 hunks: validator branches + upsert-missing
  allowlist; 022 ingress block, 023 guards/feed, 024 payment gates untouched).
- Behavior: 34/34 suite covers sale/purchase/notification/payment paths; F-matrices
  above cover the six entities' valid flows.

## 36. Diff-scope proof (F15)

`git diff --name-only` = `H.S.H-V2.0.0/backend/src/sync/sync-service.ts` (+73/-1)
+ `TEMP-PBS-BUG-024-AUDIT.md` (expected prior-cycle cleanup deletion). Untracked:
`TEMP-PBS-BUG-025-AUDIT.md` only. Zero frontend/model/route/config files.

## 37. Remaining uncertainty

1. Present-but-invalid enum values (e.g. worker status "bogus") still reach model
   validation with raw text -- measured? No (not probed; out of scope by gate rule:
   presence-only). Candidate narrow follow-up; explicitly NOT fixed here. LOW.
2. Other entities' required-field gaps (task? expense already gates; invoice is
   026) were not audited -- 025 scope is the six proven entities only. LOW.
3. A direct client that previously (accidentally) relied on raw-text errors for
   these fields sees stable codes instead -- intended contract improvement; no
   consumer references REQUIRED codes (new) and INVALID codes are unchanged. LOW.

## 38. Final status

FIXED -- READY FOR GIORNO REVIEW
