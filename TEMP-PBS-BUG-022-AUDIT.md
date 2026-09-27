# TEMP-PBS-BUG-022-AUDIT -- legacy `weight` alias accepted by validation, NaN in handlers

Status: **FIXED -- READY FOR GIORNO REVIEW** (see section 28).
Bug remains open -- only Giorno can close it.

Date (UTC): 2026-09-27.
Workspace: `C:\Users\islam\OneDrive\Desktop\poultry-business-suite`
Runtime under test: backend `tsx` + `mongoose 9.9.3` + `mongodb-memory-server 11.3.0`
(single-node replica set, transactions supported), driving the REAL exported
`processSyncOperation()` with REAL Mongoose models. No mocks, no HTTP. Node v22.

START-OF-CYCLE CLEANUP (PBS-BUG-019 is CLOSED):
- Deleted `TEMP-PBS-BUG-019-AUDIT.md` (was committed; now shows as `D`).
- No `tmp-pbs019` spec/config/harness remnants existed; nothing else removed.
- The permanent one-line PBS-BUG-019 Products fix (`(Number(product.weightKg) || 0)`
  at `app/products/page.tsx` L732) was NOT reverted -- verified intact in final checks.

---

## 1. Bug definition

PBS-BUG-022 (CONFIRMED): backend sync validation (`validatePurchaseSalePayload`)
accepts the legacy item alias `weight` (`weightKg !== undefined ? weightKg : weight`),
but the authoritative create handlers (`handleSaleCreate`, `handlePurchaseCreate`)
aggregate ONLY `Number(item.weightKg)`. A legacy/direct sync item carrying only
`{productId, quantity, weight, price}` therefore passes validation and then computes
`Number(undefined) = NaN` stock math. In the sale flow `prod.weightKg < NaN` is false,
so the insufficient-stock check is additionally defeated; the subsequent `$inc`
carries NaN. Measured end-state (sections 11-14): deterministic failed sync operation
with `Cast to Number failed for value "NaN"` and FULL transaction rollback (no
persistent corruption -- the earlier audit's open question is resolved by measurement:
Mongoose casts the `$inc` value and throws, `withTransaction` aborts everything).

## 2. Current alias contract

- Accepted aliases: per-item `weightKg` (canonical) and `weight` (legacy), recognized
  in: `validatePurchaseSalePayload` L201 (`!== undefined` precedence: `weightKg` wins),
  generic `aggregateItems` L469 (`weightKg ?? weight ?? 0`), product-entity validation
  L1010 (`weightKg ?? weight`), and the generic NaN-string key list L1227-1228.
- NOT recognized: the create handlers L313/L349 (`Number(it.weightKg)` only) -- the
  contract split that is this bug.
- Rule 9 respected: the fix recognizes no new shapes; it only makes the already-
  accepted alias reach the handlers in canonical form.

## 3. Full weight/weightKg usage inventory (A1)

All in `H.S.H-V2.0.0/backend/src/sync/sync-service.ts` (2436 lines pre-fix):

- L201-208 VALIDATION: `weightRaw = it.weightKg !== undefined ? it.weightKg : it.weight`;
  required (L202), finite + >= 0 (L206). Alias-aware. Returns error code or null;
  NEVER mutates the payload.
- L226/L229 VALIDATION: strict finite re-check + `roundMoney(weightKg * price)` total
  match. Alias-derived value only.
- L308-315 AGGREGATION (sale create): `cur.weight += Number(it.weightKg)` --
  alias-BLIND. BUG SITE (with L313).
- L316-321 STOCK CHECK (sale create): `prod.quantity < need.qty`,
  `prod.weightKg < need.weight` -- defeated by NaN (`x < NaN` is false).
- L322-329 STOCK MUTATION + change-log (sale create): `$inc: {quantity: -need.qty,
  weightKg: -need.weight}` -- NaN reaches the driver here.
- L344-355 AGGREGATION + MUTATION (purchase create): same blind pattern, no stock
  check by design (purchases increase stock).
- L463-469 NORMALIZATION-adjacent AGGREGATION (`aggregateItems`):
  `Number(it.weightKg ?? it.weight ?? 0)` -- alias-aware; used ONLY by
  update/delete paths (L481-482, L550, L590-591, L655). Already safe.
- L475-522 / L548-562 / L584-622 / L653-668 update/delete handlers: consume
  `need.weight` from `aggregateItems` (safe) + `oldNeed` from stored docs.
- L905-959 VALIDATION dispatch (`validateHshPayload` -> `validatePurchaseSalePayload`
  for sale/purchase create/upsert/update; returns code, no mutation).
- L1010 product-entity validation alias read -- different entity (product rows), not
  sale/purchase items; untouched.
- L1227-1228 generic NaN-string key allowlist -- validation-surface only; untouched.
- L1410-1435 INGRESS: payload cloned (`{...operation.payload}`); per-entity
  normalizations (notification channel, incomingInvoice `number` alias) -- the
  established precedent the fix follows.
- L1566-1591 validation gate (pre-transaction); L1605 transaction; L1737-1748
  business handlers on the cloned payload; L1750-1758 `toCreate = {...payload,...}`
  persisted via `model.create` (raw `weight`-only items would be strict-stripped +
  fail required-`weightKg` validation -- measured in B2 as post-$inc failure);
  L1839/L2101 upsert/update `candidate = {...existing, ...payload}` (covered by
  ingress normalization); L2118-2119 update handlers (alias-safe aggregator).

## 4. Validation analysis (A2)

`validatePurchaseSalePayload(payload, operation, entity)` L156-289: requires items
for create/upsert (non-empty, <= 500, objects with non-empty productId); quantity
required, integer, > 0; weight alias accepted, required, finite, >= 0; price/total
required, finite, >= 0; per-item total must match `roundMoney(weight*price)` within
0.005; payload total must match grand sum for create/upsert; date required for
create/upsert; supplierId/customerId rules. Returns `string | null`. It VALIDATES
ONLY -- the payload object is never written. Error codes preserved verbatim by the
fix (F7 proves code-parity for alias vs canonical invalids).

## 5. Sale handler trace (A3)

`handleSaleCreate` L303-336: items -> per-product `{qty, weight}` agg (L313 blind)
-> product lookup (`PRODUCT_NOT_FOUND`) -> quantity check -> weight check L320
(`prod.weightKg < need.weight`; NaN need defeats it) -> `total` -> per-product
`$inc` L324 (NaN) -> revision/change-log writes -> customer `$inc: balance` ->
customer revision/change-log -> return null. On `weight`-only input the measured
failure is a Mongoose CastError from the `$inc` value; `withTransaction` aborts all
of the above plus the later `toCreate`/`SyncChange`/`ProcessedSyncOperation` success
writes (only the failure record persists, by design).

## 6. Purchase handler trace (A4)

`handlePurchaseCreate` L338-367: supplier lookup -> total -> per-product agg (L349
blind) -> per-product `$inc: {quantity: +qty, weightKg: +weight}` L355 (NaN) ->
revision/change-log -> supplier balance -> revision/change-log. No stock check exists
by design; measured failure identical CastError + full rollback (B6).

## 7. Model/schema behavior (A5)

`sale.model.ts` / `purchase.model.ts`: item subdocuments REQUIRE
`productId/quantity/weightKg/price/total` (all `required: true`); schemas are
strict by default, so an unknown `weight` key is silently DROPPED while a missing
`weightKg` fails `model.create` validation. Measured order of failure for
weight-only input: business-handler `$inc` CastError fires FIRST (inside the
transaction, everything aborts); the schema layer would independently reject the
document second. Either way nothing partial persists (B7). No model file changed
(rule: not required -- normalization happens before models see the payload).

## 8. Producer/caller analysis (A6)

- Current frontend (`sale.operation.ts` L38/L47/L77/L85, `purchase.operation.ts`
  L42/L51/L73 and sibling edit/reversal ops): ALWAYS canonical `weightKg` items
  (`items: input.items` pass-through; `Number.isFinite(item.weightKg)` enforced
  client-side). Verified by grep -- no current frontend path emits bare `weight`.
- Legacy/direct sync callers (older clients, manual sync payloads) may emit `weight`
  -- the alias the backend validator explicitly accepts. Scope is therefore
  legacy/direct sync compatibility, as briefed; runtime confirms current writers
  are unaffected (F1/F4 identical pre/post fix).
- No current backend path normalized the alias before this fix (only the
  update/delete `aggregateItems` tolerated it, and only for math, not persistence).

## 9. Baseline test environment (Phase B)

Disposable script `backend/tmp-pbs022-baseline.ts` (deleted after the cycle;
`PBS022_MODE=baseline|postfix`): boots `MongoMemoryReplSet` (1 node, wiredTiger --
transactions live), connects mongoose, imports the REAL `processSyncOperation` and
REAL models, seeds product (qty/weight known) + customer + supplier docs, submits
create operations, and prints JSONL observations (result, product state, sale/purchase
doc presence/items, change-log deltas). Product 100/100 for sufficient cases;
100/5 for insufficient-stock cases; canonical item `{qty 2, weightKg 10, price 5,
total 50}`; legacy item identical with `weight: 10` and NO `weightKg`.

## 10. Canonical `weightKg` controls (B1/B3/B5)

- B1 sale: `{success:true}`, stock 100/100 -> 98/90, persisted item
  `{productId,qty 2,weightKg 10,price 5,total 50}`. PASS.
- B3 sale, stock weight 5 < need 10: `{success:false, error:"INSUFFICIENT_STOCK"}`,
  stock unchanged 100/5. PASS (expected check behavior locked).
- B5 purchase: `{success:true}`, stock 100/100 -> 102/110. PASS.

## 11. Legacy `weight` reproduction evidence (B2/B6)

- B2 sale weight-only: validation ACCEPTED (no `SALE_WEIGHT_*` code); downstream
  result `{success:false, error:'Cast to Number failed for value "NaN" (type number)
  at path "weightKg"'}`; product UNCHANGED 100/100; sale doc ABSENT; sale
  change-log delta 0. Bug confirmed: accepted-then-NaN.
- B6 purchase weight-only: identical CastError; product 100/100 unchanged;
  purchase doc absent. Bug confirmed on both entities.

## 12. Insufficient-stock bypass evidence (B4)

Stock weight 5, canonical need 10 -> `INSUFFICIENT_STOCK` (B3). Same setup with
weight-only need 10 -> result is the NaN CastError, NOT `INSUFFICIENT_STOCK`;
product unchanged only because the later CastError aborted the transaction.
The check `5 < NaN = false` demonstrably passed a sale that had to be rejected for
stock reasons -- the business-logic split proven in its strongest form.

## 13. Purchase reproduction evidence

B6 (section 11). Purchases have no stock check by design, so the entire harm is
accepted-then-NaN-fail; post-fix they succeed canonically (F5).

## 14. Transaction/rollback findings (B7)

For EVERY failing legacy operation (B2/B4/B6): product quantity+weightKg
byte-identical before/after; sale/purchase document absent; entity change-log delta
0. The earlier audit's open question is settled by measurement: NO persistent
corruption occurs -- `withTransaction` aborts on the CastError. Exact residual impact
pre-fix: accepted payload -> deterministic failed sync op (+ cryptic error) +
defeated stock check. Post-fix these become successes (F2/F3/F5).

## 15. Exact root cause

Validation/handler contract split at the sync ingress: the validator blesses the
`weight` alias while the create aggregators (`Number(it.weightKg)`, L313/L349) and
the stock check (`prod.weightKg < need.weight`, L320) read only the canonical key.
`Number(undefined)` = NaN poisons the aggregate; comparisons against NaN are false
(check bypass); `$inc` with NaN throws a Mongoose CastError that aborts the
transaction. One missing normalization at the single ingress point through which
validation, handlers, candidates, and persistence ALL flow.

## 16. Exact normalization design (Phase C)

Single ingress point in `processSyncOperation`, immediately after the payload clone
(L1410-1413) alongside the existing incomingInvoice alias precedent -- NOT
duplicated across handlers (rule 8):

- Scope: `operation.entity === "sale" || "purchase"` only; non-array `items` left
  for the validator to reject; non-object items passed through untouched.
- Fill rule: `weightKg === undefined && weight !== undefined` -> copy `weight` to
  `weightKg`. This mirrors the validator's `!== undefined` precedence EXACTLY
  (`weightKg` wins when both present; `weightKg: null` does NOT trigger fill, so the
  existing `*_WEIGHT_REQUIRED` behavior is preserved bit-for-bit).
- Clone safety: `payload` is already a shallow clone, but `items` is shared with the
  caller -- so the array is REPLACED and filled items are SPREAD into new objects;
  the caller's array/objects are never mutated. Untouched items keep identity.
- Legacy `weight` key is KEPT (not deleted): out-of-scope narrowing avoided;
  Mongoose strict schemas strip it on create and strict-strip it on `$set` updates
  (measured: persisted items carry `weightKg` only, section 24).
- Invalid alias values (non-numeric/negative) are copied raw and then rejected by
  the UNCHANGED validator with the SAME codes as canonical invalids (F7) -- no new
  codes, no lost codes (rules 7/10).
- String numerics (`"10"`) flow into the validator's existing `toFiniteNumber`
  coercion, exactly as canonical string numerics do today.

## 17. Why normalization point is correct

It is the EARLIEST point where (a) the payload is already an owned clone, (b) BOTH
entities' flows converge, and (c) ALL downstream consumers sit below it:
`validateHshPayload` (L1567) -> create handlers (L1739-1740) -> `toCreate`
persistence (L1750) -> upsert/update `candidate`s (L1839/L2101, built FROM this
payload) -> update handlers + `$set` persistence. One edit fixes create, upsert,
and update paths; update/delete handlers (already alias-safe) and the generic
aggregator observe canonical input with identical numeric results. Normal `weightKg`
payloads are untouched item-for-item (same values, same references except a
re-created array shell -- byte-semantic equivalent, proven by F1/F4 parity with B1/B5
and the 34/34 integrity suite).

## 18. Permanent files changed

Exactly ONE: `H.S.H-V2.0.0/backend/src/sync/sync-service.ts` (+28/-0, single added
block; verified by `git diff --stat`).

## 19. FULL BEFORE code for every modified permanent file

Only `backend/src/sync/sync-service.ts` was modified (+28/-0). BEFORE: the ingress
sequence went directly from the incomingInvoice normalization block to the Office
file size-safety block, with NO sale/purchase item handling (complete enclosing
region, L1421-1438):

```ts
  // Incoming invoice: normalize supplierInvoiceNumber via trim + toLowerCase for uniqueness (companion field)
  if (operation.entity === "incomingInvoice") {
    const p: any = payload;
    // Unify `number` alias into canonical supplierInvoiceNumber
    if (p.number != null && (p.supplierInvoiceNumber == null || String(p.supplierInvoiceNumber).trim() === "")) {
      p.supplierInvoiceNumber = p.number;
    }
    if (p.supplierInvoiceNumber != null) {
      const trimmedNum = String(p.supplierInvoiceNumber).trim();
      if (trimmedNum) {
        p.supplierInvoiceNumber = trimmedNum;
        p.supplierInvoiceNumberNormalized = trimmedNum.toLowerCase();
      }
    }
  }

  // Size safety for Office files (several MB per file, documented limit)
```

i.e. sale/purchase `payload.items` reached validation/handlers/persistence with a
bare `weight` alias intact -- the contract split.

## 20. FULL AFTER code for every modified permanent file + complete unified diff

AFTER: the new normalization block sits between those two blocks (complete added
region):

```ts
  // PBS-BUG-022: unify the legacy `weight` item alias into canonical `weightKg`
  // for sale/purchase BEFORE validation, business handlers, and persistence
  // consume the payload. Validation already accepts the alias (with `weightKg`
  // winning when both are present), but the create handlers aggregate only
  // `weightKg`, so an un-normalized alias passed validation and then computed
  // NaN stock math while defeating the insufficient-stock check. Normalizing
  // here covers create/upsert/update candidates and persisted documents
  // uniformly. The caller's object is untouched: `payload` above is already a
  // shallow clone, and items are re-created (never mutated in place); the
  // legacy `weight` key itself is left for Mongoose strict-schema stripping.
  if (operation.entity === "sale" || operation.entity === "purchase") {
    const p: any = payload;
    if (Array.isArray(p.items)) {
      p.items = p.items.map((it: any) => {
        if (
          it != null &&
          typeof it === "object" &&
          !Array.isArray(it) &&
          (it as any).weightKg === undefined &&
          (it as any).weight !== undefined
        ) {
          return { ...(it as any), weightKg: (it as any).weight };
        }
        return it;
      });
    }
  }
```

Complete unified diff (literal, sole production hunk):

```diff
diff --git a/H.S.H-V2.0.0/backend/src/sync/sync-service.ts b/H.S.H-V2.0.0/backend/src/sync/sync-service.ts
index 95d41b9..49df5ca 100644
--- a/H.S.H-V2.0.0/backend/src/sync/sync-service.ts
+++ b/H.S.H-V2.0.0/backend/src/sync/sync-service.ts
@@ -1434,6 +1434,34 @@ export async function processSyncOperation(
     }
   }

+  // PBS-BUG-022: unify the legacy `weight` item alias into canonical `weightKg`
+  // for sale/purchase BEFORE validation, business handlers, and persistence
+  // consume the payload. Validation already accepts the alias (with `weightKg`
+  // winning when both are present), but the create handlers aggregate only
+  // `weightKg`, so an un-normalized alias passed validation and then computed
+  // NaN stock math while defeating the insufficient-stock check. Normalizing
+  // here covers create/upsert/update candidates and persisted documents
+  // uniformly. The caller's object is untouched: `payload` above is already a
+  // shallow clone, and items are re-created (never mutated in place); the
+  // legacy `weight` key itself is left for Mongoose strict-schema stripping.
+  if (operation.entity === "sale" || operation.entity === "purchase") {
+    const p: any = payload;
+    if (Array.isArray(p.items)) {
+      p.items = p.items.map((it: any) => {
+        if (
+          it != null &&
+          typeof it === "object" &&
+          !Array.isArray(it) &&
+          (it as any).weightKg === undefined &&
+          (it as any).weight !== undefined
+        ) {
+          return { ...(it as any), weightKg: (it as any).weight };
+        }
+        return it;
+      });
+    }
+  }
+
   // Size safety for Office files (several MB per file, documented limit)
   if (operation.entity === "officeFile") {
     try {
```

(Header/hunk copied verbatim from `git diff`; block verified line-exact against the
working file. All other 2436 lines byte-identical to HEAD.)

## 21. Verification commands

From `H.S.H-V2.0.0/backend`:
1. Baseline: `npx tsx tmp-pbs022-baseline.ts` (default mode) -> B1/B3/B5 controls
   green; B2/B4/B6 show accepted-then-NaN-CastError with full rollback.
2. Post-fix: `PBS022_MODE=postfix npx tsx tmp-pbs022-baseline.ts` (PowerShell:
   `$env:PBS022_MODE="postfix"; npx tsx tmp-pbs022-baseline.ts`) -> F1-F7 all green
   (section 22).
3. F12: `npx tsc --noEmit` -> exit 0, no output. (`npm run build` runs emitting
   `tsc`; `--noEmit` used to avoid writing `dist/`.)
4. Existing suite: `npm run test:hsh-sync` -> `34 passed, 0 failed` with fix in place.
5. F13: backend ESLint NOT configured (no eslint config/deps in backend
   package.json) -- nothing to run; documented, not skipped silently.
6. F14: `git diff --name-only` (repo root) -> `backend/.../sync-service.ts` +
   `TEMP-PBS-BUG-019-AUDIT.md` (expected prior-cycle cleanup deletion) only.

## 22. Exact outputs/results

- B1: `{success:true, prod:{98,90}, item:{...,weightKg:10,...}}`.
- B2: `{success:false, error:'Cast to Number failed for value "NaN" (type number) at
  path "weightKg"', prod:{100,100}, saleDoc:null, changeDelta:0}`.
- B3: `{success:false, error:"INSUFFICIENT_STOCK", prod:{100,5}}`.
- B4: `{success:false, error:'Cast...NaN...', prod:{100,5}, saleDoc:null}` (bypass).
- B5: `{success:true, prod:{102,110}}`.
- B6: `{success:false, error:'Cast...NaN...', prod:{100,100}, purDoc:null}`.
- F1: `{success:true, prod:{98,90}, finite:true}` (== B1).
- F2: `{success:true, prod:{98,90}, item:{productId,quantity 2,weightKg 10,price 5,
  total 50}, hasLegacyKey:false, finite:true}`.
- F3: `{success:false, error:"INSUFFICIENT_STOCK", prod:{100,5}}` (== B3).
- F4/F5: `{success:true, prod:{102,110}}` both; legacy item canonical, finite.
- F6: `{success:true, prod:{98,90}, item.weightKg:10}` (weightKg wins over weight:999).
- F7 x4: `{success:false, error==want, match:true, docAbsent:true, prod unchanged}`:
  str-alias/str-canon/neg-alias -> `SALE_WEIGHT_INVALID`; missing -> `SALE_WEIGHT_REQUIRED`.
- Integrity suite: `=== H.S.H sync integrity: 34 passed, 0 failed ===`.
- Full JSONL captured in-session; disposable script removed afterwards.

## 23. Alias precedence result (F6)

`{weightKg:10, weight:999, total:50}` (total consistent with weightKg): success,
stock decremented by exactly 10 (98/90), persisted item `weightKg:10`, legacy `999`
nowhere (not in math, not in doc). Pre-fix validation precedence (`weightKg` wins,
L201) preserved exactly -- normalization only fills when `weightKg === undefined`.

## 24. Persisted canonical-shape result (F8)

F2 sale doc item: `{productId, quantity, price, total, weightKg:10}`, `weight` key
ABSENT (Mongoose strict-strip). F5 purchase doc item identical shape. Legacy input
is stored canonically and does not silently disappear (weightKg present and correct).

## 25. Stock finiteness result (F9/F10)

After every successful op (F1/F2/F4/F5): `Number.isFinite(quantity) &&
Number.isFinite(weightKg)` true; no NaN/null stock. Every failing op (B2/B4/B6/F7):
stock byte-identical, no partial doc, no stray change-log (B7 deltas 0) -- rollback
holds pre- AND post-fix.

## 26. Regression-boundary proof

`git diff --name-only` = `H.S.H-V2.0.0/backend/src/sync/sync-service.ts` (+28/-0)
+ prior-cycle audit deletion. Untouched and absent from diff: frontend products page
+ 019 fix (verified L732 intact), settings page + 017 queue, `useDbSync` (015),
customer forms (016), sync manager/services, route auth/trust (020), batch/rate-limit
(021), notifications (023), payments (024), generic validation (025), incomingInvoice
(026), backend models/schemas (no migration), frontend (F11: zero frontend files in
diff; grep proves current frontend sends canonical `weightKg`). No adjacent-code
cleanup inside sync-service.ts (single added block). Integrity suite 34/34 green.

## 27. Remaining uncertainty

1. Update-path `$set` with legacy `weight` inside items: strict-strip assumed from
   Mongoose defaults (same mechanism measured on create, F2/F5); not separately
   runtime-probed for updates. LOW (update handlers were already alias-safe for math;
   normalization now canonicalizes their input too).
2. Legacy `weight` as non-numeric junk: rejected with canonical codes (F7); no new
   rejection surface. LOW.
3. Multi-item mixed-alias payloads behave per-item by construction (map is per-item);
   covered implicitly by single-item proofs + precedence test. LOW.

## 28. Final status

FIXED -- READY FOR GIORNO REVIEW
