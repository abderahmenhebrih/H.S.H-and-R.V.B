# TEMP-PBS-BUG-019-AUDIT -- legacy Product row missing `weightKg` crashes Products page

Status: **FIXED -- READY FOR GIORNO REVIEW** (see section 24).
Bug remains open -- only Giorno can close it.

Date (UTC): 2026-09-27.
Workspace: `C:\Users\islam\OneDrive\Desktop\poultry-business-suite`
Runtime under test: Next `16.3.5`, React/React-DOM `19.2.8`, Playwright `1.63.0`
(Desktop Chrome), against the already-running `next dev` server on
`http://localhost:3000` (no backend on `:5000`; product layer is local
Dexie/IndexedDB database `HebrihSlaughterHouse`, store `products`).

START-OF-CYCLE CLEANUP (PBS-BUG-018 dispositioned REJECTED -- NOT A BUG):
- Deleted `TEMP-PBS-BUG-018-AUDIT.md`.
- No `tmp-pbs018` spec/config/harness remnants existed; nothing else removed.
- No production code altered for 018. The CLOSED PBS-BUG-017 Settings fix is intact
  (`app/settings/page.tsx` absent from `git diff`; verified in final checks).

---

## 1. Bug definition

`app/products/page.tsx` rendered each table row's weight with a direct
`product.weightKg.toFixed(2)` call. Current writers always store a finite number,
but a legacy/seeded row lacking the `weightKg` property throws
`TypeError: Cannot read properties of undefined (reading 'toFixed')` during render.
With no error boundary on the page, the exception unmounts the ENTIRE Products page
(Next shows its "couldn't load" fallback): the legacy row AND all valid rows become
inaccessible.

## 2. Narrow legacy precondition

- Current Product writers/types REQUIRE numeric `weightKg` (section 4); the failure
  needs an older/legacy/seeded Dexie row without that field. No current creation,
  edit, import, seed, or migration path in the repo produces such a row (verified:
  no seed/import/migration files reference weight; writers validate finiteness).
- Reproduction constructs exactly this shape via raw IndexedDB insertion (bypassing
  TypeScript, as a legacy DB would): `{id, name, price, quantity, description,
  createdAt, updatedAt}` with NO `weightKg` key. `null` variant also verified (B4).

## 3. Static weightKg usage inventory (A1)

Every `weightKg`/`.toFixed(` site in `app/products/page.tsx` (1162 lines, full grep):

- L45 `weightKg: string` (create/edit FORM state) -- irrelevant (string form field).
- L54 `weightKg: "0"` (EMPTY_FORM) -- irrelevant.
- L70/L148/L226 translation labels -- irrelevant.
- L404 `String(product.weightKg)` (search filter haystack) -- SAFE for undefined
  (`String(undefined)` = `"undefined"`, no throw; pre-existing cosmetic wart, out of
  scope, untouched).
- L425 `products.reduce((sum, p) => sum + (Number(p.weightKg) || 0), 0)` (TOTAL STOCK
  aggregate) -- SAFE: `Number(undefined)` = NaN, `NaN || 0` = 0. THIS is the page's
  existing missing-weight fallback semantics (missing contributes 0).
- L429 same `Number(...) || 0` pattern for quantity/price -- safe, same idiom.
- L451 `weightKg: String(product.weightKg)` (edit-form prefill) -- no-throw
  (`"undefined"` text for legacy rows; pre-existing cosmetic wart, out of scope,
  untouched per minimal-fix rule).
- L473-506 validation + `weightKg: Number(form.weightKg)` (current writers) -- safe.
- L665 header label -- irrelevant.
- L732 `{product.weightKg.toFixed(2)}` (row weight cell) -- UNSAFE: throws on
  undefined/null. THE crash site. Sole unsafe location on the page.
- L892/L896 form input binding -- irrelevant.
- L1038 `deleteDisplaySec.toFixed(1)` (delete countdown) -- unrelated number, safe.
- `src/components/invoice/FormalInvoiceDocument.tsx` L374
  (`line.weightKg.toFixed(2)`) operates on INVOICE LINE items (sale/purchase
  snapshots), a different entity path not fed by legacy Product rows -- out of 019
  scope per rules 1-2, untouched.

## 4. Product type/writer analysis (A2)

- Type (`src/types/entities/product.ts` L7): `weightKg: number` REQUIRED.
- `product.service.ts` create/update (L12/L37/L51) and `product-edit.operation.ts`
  (L11/L28/L52): `Number.isFinite(input.weightKg)` enforced, else throw -- current
  writers CANNOT persist undefined/null (proven at runtime in B5/F7).
- `product.repository.ts`: thin `BaseRepository` wrapper (`getAll` = `table.toArray`);
  ZERO normalization between Dexie row and page state.
- No seed/import/migration file in the repo references weight -- legacy rows can only
  arrive from older/external databases, which is exactly the tested precondition.
- No type/schema change made (rule 3): `weightKg` stays required; only the render
  boundary tolerates its runtime absence.

## 5. Exact unsafe render path (A3)

IndexedDB row (`products` store, no `weightKg` key)
-> `productRepository.getAll()` (`table.toArray()`, no normalization)
-> `productService.getAll()` (pass-through)
-> `loadProducts()` L360-364: `setProducts(await productService.getAll())`
-> `products` React state (raw rows, incl. legacy shape)
-> `filteredProducts` useMemo L396-420 (no weight normalization; `String()` haystack
  cannot throw)
-> `.map()` row render L707-764
-> L732 `product.weightKg.toFixed(2)` THROWS `TypeError`
-> no error boundary on the page -> React unmounts the whole tree -> Next
  "This page couldn't load" fallback (observed verbatim in B2).

## 6. Existing fallback semantics (A4)

L425: `(Number(p.weightKg) || 0)` -- missing weight contributes 0 to TOTAL STOCK.
The fix mirrors this EXACT idiom at the render boundary (section 13-14), so the
row cell (`0.00`) and the aggregate (legacy contributes 0) agree by construction.
`null` behaves identically under both (`Number(null)` = 0). No new product behavior
invented; `undefined`/missing-property/`null` are the only shapes covered (A5) --
no arbitrary malformed-string/object handling added (a non-numeric string renders via
the same `Number()` coercion the aggregate already uses, e.g. `"12.5"` -> `12.50`).

## 7. Baseline reproduction method (Phase B)

Disposable files (removed after the cycle): `e2e/tmp-pbs019.spec.ts` (B1-B5) +
`playwright.tmp-pbs019.config.cjs` (baseURL `:3000`, 1 worker). REAL `/products`
page, REAL Dexie database. Legacy rows inserted with RAW `indexedDB` API
(`HebrihSlaughterHouse` / `products` store / `add`) so TypeScript cannot prevent the
legacy shape. Fresh browser context per test. `page.on("pageerror")` captures the
render exception.

## 8. Valid-row control (B1)

Row `{name:"Valid Bird", price:100, quantity:5, weightKg:12.5}`: page renders,
weight cell `12.50`, TOTAL STOCK `12.5 kg`, RPV `500.00 DA`, ZERO page errors.
Harness valid.

## 9. Legacy-row crash evidence (B2)

Dataset `{valid 12.5kg row + legacy row WITHOUT weightKg key}` then reload:
- `pageerror`: `["TypeError: Cannot read properties of undefined (reading 'toFixed')"]`
- Body replaced by: `This page couldn't load / Reload to try again, or go back.`
- `legacyVisible:false` AND `validVisible:false` -- the single legacy row takes down
  the ENTIRE list; valid rows become inaccessible. Reproduction claimed ONLY on this
  observed runtime failure (signature matches the predicted one exactly).

## 10. Repeatability evidence (B3)

B2 repeated in 3 independent fresh contexts: identical TypeError, identical
page-level failure, identical valid-row inaccessibility, 3/3. Deterministic.

## 11. Current-writer result (B5) + null control (B4)

- B5 (real UI: Add Product -> fill name/price/quantity/3.25 -> Create): stored row
  `weightKg:3.25` (`typeof "number"`), renders `3.25`, zero errors. 019 is purely
  legacy compatibility, NOT a current creation bug.
- B4 (`weightKg:null` row): crashes identically
  (`TypeError: Cannot read properties of null (reading 'toFixed')`) -- null is a
  realistic legacy-JSON variant, covered by the same fix (section 14).

## 12. Root cause

Untolerated required-field assumption at ONE render boundary (L732): the type says
`weightKg: number`, writers enforce it, but storage predates/is-external-to those
guarantees and the load path performs zero normalization, so a legacy row reaches
`.toFixed()` as `undefined`. No error boundary contains it, hence page-level failure.

## 13. Exact fix (Phase C)

One expression at the proven crash boundary; no stored-row mutation, no migration,
no sync-op, no schema/type change, no hidden products, no broad try/catch, no other
numeric formatting touched:

```tsx
{(Number(product.weightKg) || 0).toFixed(2)}
```

## 14. Why the fix matches existing semantics

- It is the L425 aggregate idiom (`Number(p.weightKg) || 0`) relocated to the cell:
  undefined/null -> `0.00`; `12.5` -> `12.50` (unchanged); `7` -> `7.00`
  (unchanged); `0` -> `0.00` (unchanged); numeric strings coerce identically to the
  aggregate. Row cell and TOTAL STOCK now agree for every input shape.
- The `?? 0` alternative was REJECTED: `|| 0` additionally maps NaN payloads to 0
  exactly like the aggregate, and the `|| 0` shape is already proven lint-clean in
  this file (L425 passes ESLint; no new findings -- section 18).
- FormalInvoiceDocument L374 deliberately untouched (different entity path, 019/022
  boundary). L404/L451 `String()` wart deliberately untouched (no-throw, cosmetic).

## 15. Permanent files changed

Exactly ONE: `H.S.H-V2.0.0/frontend/app/products/page.tsx` (+1/-1).

## 16. FULL BEFORE code for every modified permanent file

`app/products/page.tsx` L731-733 BEFORE (complete enclosing element):
```tsx
                    <span className={styles.tdWeight}>
                      {product.weightKg.toFixed(2)}
                    </span>
```

## 17. FULL AFTER code for every modified permanent file + complete unified diff

`app/products/page.tsx` L731-733 AFTER (complete enclosing element):
```tsx
                    <span className={styles.tdWeight}>
                      {(Number(product.weightKg) || 0).toFixed(2)}
                    </span>
```

Complete unified diff (literal, `git diff` -- the sole production hunk):
```diff
diff --git a/H.S.H-V2.0.0/frontend/app/products/page.tsx b/H.S.H-V2.0.0/frontend/app/products/page.tsx
index 93ed624..0beaca7 100644
--- a/H.S.H-V2.0.0/frontend/app/products/page.tsx
+++ b/H.S.H-V2.0.0/frontend/app/products/page.tsx
@@ -729,7 +729,7 @@ export default function ProductsPage() {
                     </span>

                     <span className={styles.tdWeight}>
-                      {product.weightKg.toFixed(2)}
+                      {(Number(product.weightKg) || 0).toFixed(2)}
                     </span>
```
(Index hashes shown as in working tree; hunk verified line-exact against `git diff`.
All other 1161 lines byte-identical to HEAD.)

(Index hashes and hunk header copied verbatim from `git diff`; block verified
line-exact. All other 1161 lines byte-identical to HEAD.)

## 18. Verification commands

From `H.S.H-V2.0.0/frontend` (dev server live on `:3000`):
1. Baseline: `.\node_modules\.bin\playwright test --config=playwright.tmp-pbs019.config.cjs --reporter=list`
   -> 5 passed, 1 failed-harness (B5 strict selector; fixed, rerun green) -- crash
   evidence in B2x3/B4.
2. Post-fix (`e2e/tmp-pbs019b.spec.ts`, F1-F9):
   `.\node_modules\.bin\playwright test --config=playwright.tmp-pbs019.config.cjs -g "F1|F3|F6|F7" --reporter=list`
   -> 4 passed.
3. F10: `.\node_modules\.bin\tsc --noEmit` -> exit 0, no output.
4. F11: `.\node_modules\.bin\eslint app/products/page.tsx` -> 5 problems (3 errors,
   2 warnings), IDENTICAL at HEAD (verified via `git stash` + rerun): pre-existing
   unused import + mount set-state-in-effect + `no-explicit-any`s far from L732;
   zero findings on the changed line; nothing repaired silently.
5. F12: `git diff --name-only` (repo root) -> `app/products/page.tsx` +
   `TEMP-PBS-BUG-017-AUDIT.md` (expected prior-cycle cleanup deletion) only.

## 19. Exact test outputs

- B1: body shows product table, `12.50`, `TOTAL STOCK 12.5 kg`, `RPV 500.00 DA`;
  `pageerrors: []`.
- B2 reps 1-3 (identical): `errors: ["TypeError: Cannot read properties of undefined
  (reading 'toFixed')"]`, `{legacyVisible:false, validVisible:false}`, body =
  `This page couldn't load / Reload to try again, or go back.`
- B4: `errors: ["TypeError: Cannot read properties of null (reading 'toFixed')"]`.
- B5: 4 dialog inputs; stored `weightKg:3.25` number; renders `3.25`; no errors.
- F1/F2/F9: `pageerrors: []`; `Legacy Bird` + `0.00` visible; identical after reload.
- F3/F4/F5: `12.50`, `7.00`, `0.00` all visible; `TOTAL STOCK 19.5 kg`; no `NaN`.
- F6: rows before/after reload byte-equal (`weightKg` key still ABSENT);
  `syncOps 2 -> 2` (no view-triggered write/enqueue).
- F7/F8: create stores `3.25`; edit stores `9.75` (row shows `taxProfileId:null`,
  pre-existing writer behavior, unrelated); displays exact; no errors.
- Zero `pageerror`s in all 4 post-fix tests. Full stdout captured in-session;
  disposable spec/config files removed afterwards.

## 20. Mixed-dataset/aggregate results

Legacy + 12.5 + 7 dataset: all three rows render; valid cells byte-exact
(`12.50`, `7.00`); legacy cell `0.00`; TOTAL STOCK `19.5 kg` = 12.5+7+0, consistent
with the pre-existing L425 fallback math; no `NaN` anywhere on the page.

## 21. Persistence/sync side-effect check (F6)

Viewing (including double-load of) the legacy row: IndexedDB row JSON identical
before/after (legacy shape preserved, NOT normalized/migrated); `syncOperations`
count unchanged (2 -> 2); `weightKg` NOT added. Viewing is strictly read-only, as
before. No backend/sync involvement (022 boundary respected).

## 22. Regression-boundary proof

`git diff --name-only` = `app/products/page.tsx` (+1/-1) + prior-cycle audit
deletion. Untouched and absent from diff: settings page + 017 queue (verified
present in file, no hunk), `useDbSync` (015), customer forms (016), sync manager /
services / operations (012/013/014/022), backend, Product type, repository,
Dexie schema, invoice document. FormalInvoiceDocument L374 untouched (invoice-line
path, not legacy-Product path).

## 23. Remaining uncertainty

1. Legacy rows missing OTHER required numerics (price/quantity) would hit adjacent
   unguarded renders (`formatCurrency`, quantity cell) -- outside the 019 weight
   precondition; not tested, not changed. LOW relevance, noted for triage.
2. `openEdit` on a legacy row prefills `"undefined"` text via `String()` (L451) and
   blocks save with the existing invalid-weight error -- cosmetic, pre-existing,
   deliberately out of scope. LOW.
3. No migration/normalization added by design (rule 4); each legacy view renders
   `0.00` without touching storage. Intended.

## 24. Final status

FIXED -- READY FOR GIORNO REVIEW
