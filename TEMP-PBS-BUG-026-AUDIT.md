# TEMP-PBS-BUG-026-AUDIT -- incomingInvoice alias/currency sync persistence gap

Status: **FIXED -- READY FOR GIORNO REVIEW** (see section 46).
Bug remains open -- only Giorno can close it.

Date (UTC): 2026-09-27.
Workspace: `C:\Users\islam\OneDrive\Desktop\poultry-business-suite`
Runtime under test: backend `tsx` + `mongoose 9.9.3` + `mongodb-memory-server 11.3.0`
(single-node replica set, transactions live), driving the REAL exported
`processSyncOperation()` with REAL Mongoose models, plus the REAL
`POST /api/invoices/incoming` Express router via supertest for the B7/F-currency
reference. No core mocks. Node v22.

START-OF-CYCLE CLEANUP (PBS-BUG-025 is CLOSED):
- Deleted `TEMP-PBS-BUG-025-AUDIT.md` (was committed; now shows as `D`).
- No `tmp-pbs025` harness remnants remained (removed in-cycle); nothing else removed.
- The permanent PBS-BUG-025 validation gates (6 markers) were NOT reverted --
  verified intact in final checks.

---

## 1. Bug definition

PBS-BUG-026 (CONFIRMED at runtime, both halves): `validateIncomingInvoiceSync`
accepts legacy aliases (`number`, `date`, `total`, plus `amountTTC <- amountHT`
resolution) that sync ingress/persistence do not canonicalize, so alias payloads
pass validation then fail at Mongoose persistence with raw
`IncomingInvoice validation failed: ... Path ... is required` text. Separately,
sync validation tolerates missing/blank `currencyCode` (deferring to a route
fallback) but the sync path never applies the HTTP route's currency fallback
(explicit -> doc default -> global -> "DA"), so missing-currency creates also fail
raw at persistence. Impact is deterministic legacy/direct-sync failure + unstable
raw errors, never persistent corruption (all failures roll back atomically).

## 2. Two-half decomposition

- HALF A (alias split): validator-accepted `date`/`total` (+ combined legacy shape)
  not normalized at ingress; `number` already was. Reproduced B3/B4/B5/B12.
- HALF B (currency parity): missing/blank/null currency allowed by validator, no
  sync fallback; route proves `docDefault -> global -> DA`. Reproduced B6.
  Classified independently; BOTH reproduced, BOTH fixed.

## 3. IncomingInvoice model contract (A1)

`backend/src/models/incoming-invoice.model.ts` (115 lines, read in full):
required: `id` (unique), `createdAt`, `updatedAt`, `syncStatus` (enum),
`supplierId`, `supplierInvoiceNumber`, `invoiceDate` (Number),
`amountHT` (Number), `amountTTC` (Number), `currencyCode` (String, NO enum in
schema -- enforced in code). Optional/defaulted: `supplierInvoiceNumberNormalized`
(companion, NOT required -- but unique sparse index with supplierId),
`taxAmount` (default 0), `paymentStatus` (enum UNPAID/PARTIALLY_PAID/PAID, default
UNPAID), `purchaseReference?`, `notes?`, `attachment?`, `lastSyncedAt?`,
`serverRevision?`. Indexes: UNIQUE (supplierId, supplierInvoiceNumber) +
UNIQUE SPARSE (supplierId, supplierInvoiceNumberNormalized). Server-owned
(id from entityId, createdAt/updatedAt, syncStatus/serverRevision/lastSyncedAt,
normalized companion) vs client-provided (supplierId, number, dates, amounts,
currencyCode, refs/notes). Strict mode default (unknown `number`/`date`/`total`
keys stripped -- never persisted as legacy keys, measured F2/F4).

## 4. Full validator alias matrix (A2)

`validateIncomingInvoiceSync` (L1352-1440) + sync pre-checks (L1159-1197), current:
- supplierInvoiceNumber <- `number` (L1364 `p.supplierInvoiceNumber ?? p.number`):
  required (REQUIRED code), trimmed non-empty; precedence canonical-wins.
- invoiceDate <- `date` (L1365 `p.invoiceDate ?? p.date`): required-ish
  (INVOICE_DATE_INVALID when both absent/unparseable); canonical-wins; update path
  additionally inherits `existing?.invoiceDate`.
- amountHT <- `total` (L1367/L1385 `p.amountHT ?? p.total`): required on
  create/upsert (INCOMING_AMOUNT_INVALID when absent); canonical-wins.
- amountTTC <- `total`, then <- `amountHT` (L1368 `p.amountTTC ?? p.total ??
  p.amountHT`): same requirement; canonical-wins, then HT-fallback. Route parity:
  HTTP route computes `effectiveAmountTTC = amountTTC ?? total ?? effectiveAmountHT`
  (invoice.ts L645) -- identical chain.
- taxAmount: no alias; optional; derived `ttc-ht` when absent; TTC>=HT invariant.
- currencyCode: NO alias; optional-at-validation (explicit invalid ->
  INVOICE_CURRENCY_INVALID; missing/blank explicitly ALLOWED for create/upsert
  with comment "fallback ... would be DA"); update inherits existing.
- supplierId: NO alias; must reference existing Supplier (SUPPLIER_NOT_FOUND).
- Duplicate check: normalized `trim().toLowerCase()` + regex fallback, excluding
  self id (INCOMING_INVOICE_DUPLICATE).
- Complete alias list verified by full-function read: number/date/total (+HT->TTC
  resolution) ONLY. No other aliases exist.

## 5. Current ingress normalization matrix (A3)

Pre-fix ingress block (L1496-1510): `number -> supplierInvoiceNumber` (only when
canonical null/blank-trimmed), then trim + `supplierInvoiceNumberNormalized =
trim().toLowerCase()`. NOT normalized pre-fix: `date -> invoiceDate`,
`total -> amountHT/amountTTC`, `amountHT -> amountTTC`, currency fallback.
Contract split = exactly those four gaps (all validator-accepted). `number`
already worked (B2 green pre-fix) and is untouched.

## 6. Create persistence trace (A4)

`processSyncOperation` create: ingress clone+normalize -> L1641
`validateIncomingInvoiceSync` (alias-aware) -> L1669 `validateHshPayload`
(incomingInvoice branch: if-present finite checks only) -> transaction ->
no business handler for incomingInvoice -> `toCreate = {...payload,
serverRevision, syncStatus, lastSyncedAt, updatedAt/createdAt defaults}` ->
`model.create([toCreate])` (strict strips legacy keys; required-missing throws
ValidationError) -> SyncChange create + processed-success. Pre-fix, alias-only
payloads carried e.g. `date` without `invoiceDate` into `toCreate`, so Mongoose
rejected the MISSING canonical (B3/B4/B5 raw errors).

## 7. Update persistence trace (A4)

Update: same ingress + validations (validator fetches `existing` itself for
update-merge at validation time), then generic `updateOne({id}, {$set: toSet},
{runValidators:true})` where `toSet = {...payload, serverRevision, ...}` minus
`id`. `$set` validates only set paths; partial `{notes}` succeeds with stored
canon retained (B10 green). An alias-only partial (`{date}`) sets a strict-
stripped unknown key and (pre-fix) never moved the canonical -- now normalized
at ingress so it moves `invoiceDate` (F11b).

## 8. Upsert persistence trace (A4)

Upsert: L1567-equivalent pre-validation (op=upsert) -> transaction ->
`existingUpsert` lookup; existing -> candidate-merge validation + generic `$set`
(same partial semantics as update, plus INVOICE_IMMUTABLE nuance for `invoice`
only); missing -> `toCreate` + `model.create` (same as create, so same alias +
currency gaps pre-fix -- B12 raw). Currency fill added at the missing branch
(section 30) because ingress only fills `operation === "create"`.

## 9. Operation semantics (A5)

- Create: full canonical (or alias-equivalent) required; currency falls back.
- Upsert-missing: behaves as create (same requirements + same fallback).
- Upsert-existing: partial-capable in practice, BUT pre-existing incomingInvoice
  quirk: upsert path validates the RAW payload with op="create" semantics before
  the lookup (B11/F12 `SUPPLIER_NOT_FOUND` on notes-only -- payload lacks
  supplierId), so notes-only upserts fail identically pre/post fix (no regression,
  no improvement; documented neutrally).
- Update: partial-capable (validator merges `existing` for missing fields);
  omitted currency/aliases retain stored values (F11); alias-only partials move
  the canonical (F11b, validator-blessed).

## 10. HTTP-route currency fallback trace (A6)

`POST /api/invoices/incoming` (routes/invoice.ts L640-754), verbatim semantics:
explicit `currencyCode` non-blank must be in `["DA","€","$"]` else
INVOICE_CURRENCY_INVALID (L680); else `finalCurrencyPre = trim(payload)` or, when
blank, first non-blank allowed of `[docDefaultsCurrencyPre, globalCurrencyPre,
"DA"]` where doc = `Settings(id=settings)?.invoiceDocumentDefaults?.
defaultCurrency` (fallback any-settings-doc), global = `Settings?.currency`
(L672-691); final re-check then persist `currencyCode: finalCurrencyPre` (L734).
So: explicit > docDefault > global > DA; blank/omitted fall back (create-only
route); invalid explicit rejected. Runtime-proven in B7 (section 20).

## 11. Sync-path currency behavior (A7)

Pre-fix validator (L1390-1403): explicit non-blank must be allowed, else
INVOICE_CURRENCY_INVALID; missing/blank explicitly ALLOWED on create/upsert
("fallback ... would be DA" comment) and inherited from existing on update --
i.e. validation assumed a fallback that persistence never applied, so
`model.create` threw raw `currencyCode: Path ... is required` (B6 all three
shapes). Post-fix: ingress (create) + upsert-missing branch apply the route-
identical fallback BEFORE validation/persistence; update/upsert-existing never
filled (stored currency retained).

## 12. Frontend producer analysis (A8)

`frontend/src/services/incoming-invoice.service.ts` `create()`: sends canonical
`supplierId/supplierInvoiceNumber/invoiceDate/amountHT/amountTTC/currencyCode`
(client-validated: number non-blank, date finite, currency-if-present allowed,
amounts finite>=0, TTC>=HT), plus normalized companion. No `number`/`date`/
`total` aliases emitted. Bug scope = legacy/direct sync payloads + route parity,
not current frontend flows. Zero frontend files changed.

## 13. Baseline runtime environment (Phase B)

Disposable `backend/tmp-pbs026-baseline.ts` (deleted after the cycle):
memory replset + real `processSyncOperation` + real models; B7 mounts the REAL
invoice router via supertest. Supplier fixture `SUP` per run; unique invoice
numbers/ids; JSONL observations (result/error/message, doc fields incl.
`("number" in doc)` strict-strip checks, per-id change counts). Baseline mode
covers B1-B12 + B7; postfix mode covers F1-F16 (+F11b).

## 14. Canonical create control (B1)

Fully canonical payload: `{success:true}`, doc
`{num INV-001, norm inv-001, date, ht 100, ttc 120, cur DA}`, 1 SyncChange.
Baseline all later equivalents must match (F1 identical post-fix).

## 15. Number alias result (B2)

`number: "INV-002"` (no canonical): pre-fix `{success:true}`, persisted
`supplierInvoiceNumber: INV-002`, `normalized: inv-002`, legacy `number` key
ABSENT (strict-strip). Ingress already canonicalized -- NOT a bug; preserved
(F2 identical).

## 16. Date alias reproduction (B3)

`date` (no `invoiceDate`): validator ACCEPTS (no date code), then
`{success:false, error:"IncomingInvoice validation failed: invoiceDate: Path
'invoiceDate' is required.", doc:null, changes:0}`. Split proven.

## 17. Amount/total alias reproduction (B4)

`total:100` (no HT/TTC): validator ACCEPTS, then
`{success:false, error:"IncomingInvoice validation failed: amountTTC: Path
'amountTTC' is required., amountHT: Path 'amountHT' is required.", doc:null}`.
Split proven (both canonicals missing at persistence).

## 18. Combined legacy payload reproduction (B5)

`{number, date, total}` (+supplierId/currency): validator ACCEPTS, then raw
`amountTTC/amountHT/invoiceDate required` failure, no doc, no changes.
Complete validator-supported legacy shape fails end-to-end pre-fix.

## 19. Missing-currency reproduction (B6)

Canonical payload minus currencyCode, three shapes: omit/null/"" ALL ->
`{success:false, error:"IncomingInvoice validation failed: currencyCode: Path
'currencyCode' is required.", doc:null, changes:0}`. Validator allowed each
shape; persistence rejected. Parity gap proven (route would have fallen back).

## 20. HTTP route/runtime fallback reference (B7)

REAL router via supertest, same logical invoice (HT 100/TTC 120):
(a) no settings doc -> 200 + `DA`; (b) global `€` only -> 200 + `€`;
(c) docDefault `$` + global `€` -> 200 + `$`; (d) explicit `€` over docDefault `$`
-> 200 + `€`. Parity target proven at runtime: explicit > docDefault > global >
DA. (One transient `WriteConflict/catalog changes` probe error observed on an
isolated re-run -- retried clean; full B7 line green in the recorded run.)

## 21. Canonical-vs-alias precedence tests (B8)

Conflicting `supplierInvoiceNumber: CANON + number: LEGACY`,
`invoiceDate: T-1000 + date: T`, `amountHT/TTC: 100/120 + total: 999` ->
`{success:true}`, persisted `{CANON, T-1000, 100/120}` -- canonical wins on all
three axes (validator `??` chains + ingress number-guard). Locked; fix preserves
(F9 identical).

## 22. Invalid-alias tests (B9)

`date: "not-a-date"` -> INVOICE_DATE_INVALID; `total: "abc"` ->
INCOMING_AMOUNT_INVALID; `number: "   "` -> SUPPLIER_INVOICE_NUMBER_REQUIRED;
`currencyCode: "XX"` -> INVOICE_CURRENCY_INVALID; all with doc absent. Stable
codes the fix must preserve (F10 byte-identical post-fix).

## 23. Partial update baseline (B10)

Create canonical, then `update {notes}`: `{success:true}`, notes applied, number/
currency/amounts retained. Legitimate partial MUST survive (F11 green).

## 24. Partial upsert-existing baseline (B11)

Create canonical, then `upsert {notes}`: `{success:false, error:
"SUPPLIER_NOT_FOUND"}`, doc unchanged. Pre-existing upsert-path quirk (raw
payload validated with create semantics before lookup, so supplierId-less
partials fail) -- identical pre/post fix (F12 identical). Documented neutrally:
neither a 026 regression nor a 026 target.

## 25. Upsert-missing baseline (B12)

`upsert` nonexistent id with full legacy shape: same raw
`amountTTC/amountHT/invoiceDate required` failure as B5. Same gaps via the
missing-target branch (currency fill added there too).

## 26. Atomicity evidence (B13)

Every failing baseline case (B3/B4/B5/B6x3/B9x4/B12): doc absent, zero SyncChanges
for the id, no supplier side effects, only the terminal failure record. No
corruption -- contract/leakage bug only, as narrowed pre-cycle.

## 27. Confirmed alias-gap matrix (Decision gate)

All three fix-bound (validator-accepts + intended-equivalent + persistence-fails):
`date -> invoiceDate`, `total -> amountHT + amountTTC`, `amountHT -> amountTTC`
(the last mirroring the validator's own `?? amountHT` chain and the route's
effectiveAmountTTC). `number -> supplierInvoiceNumber` already canonicalized
(pre-existing, verified B2, untouched). No other aliases exist; none invented.

## 28. Confirmed currency-gap conclusion (Decision gate)

Fix-bound: validator allows missing/blank currency on create/upsert (explicit
comment), persistence requires it, and the route proves the intended fallback
(explicit > docDefault > global > DA, runtime-proven B7). Present-invalid stays
rejected (INVOICE_CURRENCY_INVALID) -- fallback applies ONLY to genuinely missing
per route semantics (blank/null/undefined).

## 29. Exact root cause

Two ingress omissions in `processSyncOperation`: (1) the incomingInvoice block
stopped after `number`/trim/normalized handling while the validator blessed three
more alias resolutions; persistence spreads the un-canonicalized payload so
Mongoose rejects the missing canonicals; (2) no currency fallback existed on the
sync path although validation assumed the route's. One location covers
validation, business checks, candidates, and persistence for all four operations.

## 30. Exact normalization design (C1/C3/C4)

Ingress block extended (after the untouched number handling): fill `invoiceDate`
from `date` iff canonical null/undefined and alias present (any operation --
validator blesses alias-only partials); fill `amountHT`/`amountTTC` from `total`
iff each missing; fill `amountTTC` from `amountHT` iff missing (validator+route
parity). Canonical-wins everywhere (mirrors `??` chains); legacy keys KEPT for
strict-strip (same as `number`); no coercion beyond assignment (validation still
owns finite/date parsing, so invalid aliases keep their codes -- F10). Number
trim/lowercase/duplicate semantics byte-untouched.

## 31. Exact currency fallback design (C2)

New `resolveIncomingInvoiceCurrency(payloadCurrency)` helper (module scope):
explicit non-blank returned as-is (validated downstream, so invalid stays
rejected); else read `Settings(id=settings)` fallback any-settings-doc, try
`[invoiceDocumentDefaults.defaultCurrency, currency, "DA"]` first-allowed-wins
(exact route order + allowlist + trim). Called at ingress for
`operation === "create"` when currency blank/missing, and at the upsert-missing
branch (same condition); NEVER on update/upsert-existing (stored currency
retained). Read-only SettingsModel import added; no route code touched (rule 5);
no hardcoding beyond the route's own terminal "DA" (rule 6 satisfied via B7 +
identical chain).

## 32. Why precedence remains correct

Number/date/total fills trigger ONLY when the canonical is null/undefined (and
number additionally requires blank-trimmed canonical) -- exactly the validator's
`??` semantics; conflicting-duplicate test proves canonical wins pre (B8) and
post (F9) identically. Currency: explicit non-blank short-circuits before any
default (route L684 parity), proven by F6d/F8-explicit cases.

## 33. Permanent files changed

Exactly ONE: `H.S.H-V2.0.0/backend/src/sync/sync-service.ts` (+64/-0: import,
helper, ingress alias+currency fills, upsert-missing currency fill).

## 34. FULL BEFORE code for every modified permanent file

BEFORE region 1 (imports): `TaskModel` import line followed directly by
`applyLinkedEntityLifecycleToRvbAccount` (no SettingsModel import).
BEFORE region 2 (pre-validator): `validateHshPayload` closing `return null; }`
followed directly by `export async function validateIncomingInvoiceSync`
(no helper). BEFORE region 3 (ingress): the `number`-only block
(L1496-1510: unify-if-blank + trim + normalized) followed directly by the 022
weight block (no date/total/HT-TTC/currency handling). BEFORE region 4
(upsert-missing `else`): the 024/025 create-revalidation `if (...)` allowlist
block followed directly by `if (operation.entity === "invoice") {`
(no incomingInvoice currency fill). Full verbatim texts are the minus-side of
the diff in section 35.

## 35. FULL AFTER code for every modified permanent file + complete unified diff

AFTER = BEFORE + the four insertions (helper + ingress fills + upsert-missing
fill + import), exactly as in the literal diff below (verified line-exact
against `git diff HEAD` in-session):

```diff
diff --git a/H.S.H-V2.0.0/backend/src/sync/sync-service.ts b/H.S.H-V2.0.0/backend/src/sync/sync-service.ts
index 2dcd496..eef35e0 100644
--- a/H.S.H-V2.0.0/backend/src/sync/sync-service.ts
+++ b/H.S.H-V2.0.0/backend/src/sync/sync-service.ts
@@ -16,6 +16,7 @@ import { PaymentModel } from "../models/payment.model";
 import { TransferModel } from "../models/transfer.model";
 import { ExpenseModel } from "../models/expense.model";
 import { TaskModel } from "../models/task.model";
+import { SettingsModel } from "../models/settings.model";
 import { applyLinkedEntityLifecycleToRvbAccount } from "../services/rvb-account.service";

 type SyncModel = {
@@ -1327,6 +1328,27 @@ export function validateHshPayload(
   return null;
 }

+// PBS-BUG-026: currency fallback shared by incomingInvoice sync ingress paths.
+// Mirrors POST /api/invoices/incoming exactly: explicit non-blank payload value
+// wins (validated separately); otherwise document default, then global setting,
+// then "DA". Each candidate must be a non-blank member of ["DA", "€", "$"].
+// Read-only (SettingsModel only); no HTTP side effects.
+async function resolveIncomingInvoiceCurrency(payloadCurrency: unknown): Promise<string> {
+  const allowed = ["DA", "€", "$"];
+  const explicit = payloadCurrency != null ? String(payloadCurrency).trim() : "";
+  if (explicit !== "") return explicit;
+  let settings: any = null;
+  try {
+    settings = await SettingsModel.findOne({ id: "settings" }).lean();
+    if (!settings) settings = await SettingsModel.findOne({}).lean();
+  } catch {}
+  const candidates = [settings?.invoiceDocumentDefaults?.defaultCurrency, settings?.currency, "DA"];
+  for (const cand of candidates) {
+    if (typeof cand === "string" && cand.trim() !== "" && allowed.includes(cand.trim())) return cand.trim();
+  }
+  return "DA";
+}
+
 export async function validateIncomingInvoiceSync(payload: Record<string, unknown>, operation: SyncRequestOperation): Promise<string | null> {
   // Only validate create/upsert/update for incomingInvoice
   if (payload == null || typeof payload !== "object") return "INCOMING_AMOUNT_INVALID";
@@ -1507,6 +1529,37 @@ export async function processSyncOperation(
         p.supplierInvoiceNumberNormalized = trimmedNum.toLowerCase();
       }
     }
+    // PBS-BUG-026: unify the remaining validator-accepted aliases into canonical
+    // fields BEFORE validation/persistence consume the payload. Canonical wins
+    // (mirrors the validator ?? chains: fill only when canonical is
+    // null/undefined and the alias is present). Unconditional across operations:
+    // a partial update carrying only `date`/`total` means to move the canonical
+    // field, and the validator already blesses those shapes. Legacy keys are
+    // kept for Mongoose strict-schema stripping (same as `number` above).
+    if ((p.invoiceDate === undefined || p.invoiceDate === null) && p.date !== undefined && p.date !== null) {
+      p.invoiceDate = p.date;
+    }
+    const htMissing = p.amountHT === undefined || p.amountHT === null;
+    const ttcMissing = p.amountTTC === undefined || p.amountTTC === null;
+    if ((htMissing || ttcMissing) && p.total !== undefined && p.total !== null) {
+      if (htMissing) p.amountHT = p.total;
+      if (ttcMissing) p.amountTTC = p.total;
+    }
+    // Mirror the validator's amountTTC-falls-back-to-amountHT resolution (and
+    // the HTTP route's effectiveAmountTTC), so persistence matches validation.
+    if ((p.amountTTC === undefined || p.amountTTC === null) && p.amountHT !== undefined && p.amountHT !== null) {
+      p.amountTTC = p.amountHT;
+    }
+    // PBS-BUG-026: currency fallback with exact HTTP-route semantics, for
+    // creates here (upsert-missing is handled at its own branch below; partial
+    // updates/upsert-existing must retain stored currency, so they are never
+    // filled).
+    if (operation.operation === "create") {
+      const cur = p.currencyCode;
+      if (cur === undefined || cur === null || String(cur).trim() === "") {
+        p.currencyCode = await resolveIncomingInvoiceCurrency(cur);
+      }
+    }
   }

   // PBS-BUG-022: unify the legacy `weight` item alias into canonical `weightKg`
@@ -2075,6 +2128,17 @@ export async function processSyncOperation(
               return;
             }
           }
+          // PBS-BUG-026: upsert-missing behaves as create for currency as well --
+          // a missing currencyCode here must receive the same HTTP-route fallback
+          // applied at ingress for creates (partial updates/upsert-existing keep
+          // stored currency because this branch is unreachable when a doc exists).
+          if (operation.entity === "incomingInvoice") {
+            const p: any = payload;
+            const cur = p.currencyCode;
+            if (cur === undefined || cur === null || String(cur).trim() === "") {
+              p.currencyCode = await resolveIncomingInvoiceCurrency(cur);
+            }
+          }
           if (operation.entity === "invoice") {
             const st2 = (payload as any).status;
             if (st2 && st2 !== "DRAFT") {
```

(All other ~2640 lines byte-identical to HEAD.)

## 36. Verification commands

From `H.S.H-V2.0.0/backend`:
1. Baseline: `npx tsx tmp-pbs026-baseline.ts` -> B1/B2 green; B3/B4/B5/B6/B12 raw
   failures; B7 route chain green; B8 canonical-wins; B9 codes; B10 green; B11
   pre-existing quirk.
2. Post-fix: `$env:PBS026_MODE="postfix"; npx tsx tmp-pbs026-baseline.ts` ->
   F1-F16 all green (section 37).
3. Existing suite: `npm run test:hsh-sync` -> `34 passed, 0 failed` (fix in place).
4. Typecheck: `npx tsc --noEmit` -> exit 0, no output.
5. Lint: backend ESLint NOT configured (no config/deps; re-confirmed) -- nothing.
6. Scope: `git diff --name-only` (repo root) -> sync-service.ts + prior-cycle audit
   deletion only.

## 37. Exact post-fix results

- F1: `{success:true, num INV-F1, ht 100, ttc 120, cur DA, changes 1}` (== B1).
- F2: `{success:true, num INV-F2, norm inv-f2, hasNumber:false}`.
- F3: `{success:true, date persisted, hasDate:false}` (strict-strip confirmed).
- F4: `{success:true, ht 100, ttc 100, hasTotal:false}` (total fans out to BOTH).
- F5: `{success:true, num+norm+date+ht+ttc+cur all canonical, changes 1}`.
- F6/F7/F8: `{a DA, b €, c $, d €, blank $, null $}` -- full route parity
  (explicit > docDefault > global > DA; blanks fall back, never rejected).
- F9: `{success:true, CANON number/date/amounts persisted}` (canonical-wins kept).
- F10 x4: `{success:false, error==want, match:true, clean:true, doc:false}` for
  all four invalid shapes (codes byte-identical to B9).
- F11: `{success:true, notes upd11, stored num/cur/ht retained}`; F11b alias-only
  date update moves canonical (`date == now+5000`).
- F12: `{success:false, SUPPLIER_NOT_FOUND}` -- identical to B11 (no regression).
- F13: `{success:true, num/date/ht/ttc canonical, cur $ (= docDefault at that
  point)}` -- complete legacy upsert-missing succeeds with fallback.
- F14: `{success:false, INCOMING_INVOICE_DUPLICATE}` on case/whitespace variant.
- F15/F16: doc keys canonical-only (no legacy keys stored); change
  `{n:1, op:create, hasNum:true, cur DA}`.
- Full JSONL captured in-session; disposable script removed afterwards.

## 38. Persisted canonical-shape proof (F15)

F5/F15 doc keys: `amountHT, amountTTC, createdAt, currencyCode, id, invoiceDate,
lastSyncedAt, paymentStatus, serverRevision, supplierId, supplierInvoiceNumber,
supplierInvoiceNumberNormalized, syncStatus, taxAmount, updatedAt` -- every
required canonical present, normalized companion present, NO `number`/`date`/
`total` keys stored (strict-strip). Currency present via fallback where omitted.

## 39. SyncChange payload proof (F16)

F5 change: `{n:1, operation:create, payload.supplierInvoiceNumber present,
payload.currencyCode: DA}` -- canonical and complete for HSH clients; legacy-
equivalent and canonical inputs converge to the same change shape (F1 vs F5).

## 40. Invoice-number uniqueness regression (F14)

`canon("SUP", "  inv-f1  ")` (case+whitespace variant of F1's `INV-F1`) ->
`INCOMING_INVOICE_DUPLICATE`. Untouched trim+lowercase+companion logic intact.

## 41. Error-disclosure scan (F18)

Automated `clean` check (`/Path |validation failed|Mongoose|ValidationError/i`)
passes on all F10 pairs; all F-valid legacy payloads succeed (no error text at
all). Invalid payloads use protocol codes only. Failing B-codes and F-codes are
identical strings.

## 42. Existing sync-suite result (F19)

`=== H.S.H sync integrity: 34 passed, 0 failed ===` with the 026 fix applied.

## 43. 022/023/024/025 regression proof (F22)

- Markers present and counted: 022 x1, 023 x7, 024 x2, 025 x6 (16 total) -- all
  intact; no hunk overlaps those regions (026 hunks: import, helper, ingress
  block, upsert-missing currency fill).
- Behavior: 34/34 suite covers sale/purchase/notification/payment paths; F9/F10/
  F14 cover invoice-adjacent paths. The 025 upsert-missing allowlist deliberately
  still excludes incomingInvoice (026 handles its own currency there; alias fills
  happen earlier at ingress) -- no accidental folding.
- No other entity branch touched (incomingInvoice-scoped `if`s + helper only).

## 44. Diff-scope proof (F23)

`git diff --name-only` (HEAD) = `H.S.H-V2.0.0/backend/src/sync/sync-service.ts`
(+64/-0) + `TEMP-PBS-BUG-025-AUDIT.md` (expected prior-cycle cleanup deletion).
Untracked: `TEMP-PBS-BUG-026-AUDIT.md` only (after disposable removal). Zero
frontend/model/route/config files. (Note: `git status --short` may show a
stat-dirty `M POULTRY-SUITE-RECOVERY-AUDIT.md`, but `git hash-object` matches
HEAD blob `28c005c...` and `git diff HEAD` excludes it -- content-identical,
no modification.)

## 45. Remaining uncertainty

1. Upsert-existing notes-only incomingInvoice still fails `SUPPLIER_NOT_FOUND`
   (B11/F12) -- pre-existing upsert-path validation shape, unchanged by 026,
   out of scope. LOW.
2. Route transaction `WriteConflict/catalog changes` transient observed once on an
   isolated probe re-run (retried clean; recorded B7 green) -- infra flake, not
   product logic. LOW.
3. Settings-doc fallback inside sync uses live `SettingsModel` (same collection
   the route reads); a mid-flight settings change could theoretically resolve
   differently between validation and persistence -- same race exists on the route
   itself; accepted as parity. LOW.

## 46. Final status

FIXED -- READY FOR GIORNO REVIEW
