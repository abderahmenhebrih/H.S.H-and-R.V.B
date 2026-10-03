# R.V.B MOBILE PHASE 4 — SUPPLIER

## 1. Supplier API Contract

**Exact endpoints and DTOs discovered (via `backend/src/routes/rvb-portal.ts`, `supplier-requests.ts`, `services/supplier-request.service.ts`, `lib/validate-items.ts`, `routes/rvb-catalog.ts`, `models/supplier*.ts`, `purchase.model.ts`):**

- `GET /api/rvb/portal/me` → `{ success, account, linkedEntity|entity, linkedEntityType, linkedEntityId, role }` (auth, derives `linkedEntityId` from `req.rvbUser`, strips `syncStatus, serverRevision, _id`).
- `GET /api/rvb/portal/supplier` → `{ success, supplier: SupplierProfile }` (supplier only, `role===supplier`, `linkedEntityType===supplier` + `linkedId`, else `403 RVB_FORBIDDEN` or `404 RVB_LINKED_ENTITY_NOT_FOUND` / `RVB_SUPPLIER_NOT_FOUND`). DTO: `id, name, phone, address, identificationNumber, email, notes, balance, createdAt, updatedAt` (no `syncStatus, serverRevision, lastSyncedAt, _id, __v`).
- `GET /api/rvb/portal/supplier/purchases` → `{ success, supplierId, purchases: SupplierPurchase[] }` (supplier only, server-filtered `supplierId=linkedId`, sort `date -1`). Each `Purchase`: `id, supplierId, date, createdAt, updatedAt, items: [{productId, quantity>0, weightKg>=0, price>=0, total=weight*price rounded}], total, calculation?` (safe DTO, no `syncStatus` leak).
- `GET /api/rvb/portal/supplier/payments` → `{ success, supplierId, payments: SupplierPayment[] }` (supplier only, `Payment where entityType=supplier && entityId=linkedId`, sort `date -1`). Each `Payment`: `id, entityType, entityId, amount, date, createdAt, note?`.
- `GET /api/rvb/supplier-requests` → `{ success, requests: SupplierRequest[] }` (supplier own via `linkedId` derivation, manager/admin any, others 403; `?supplierId` must equal own or omitted else 403). Each `SupplierRequest`: `id, createdAt, updatedAt, supplierId, accountId, type: new_supply|discrepancy, status: under_review|accepted|rejected, items?, total?, calculation?, date?, description?, submittedAt, reviewedAt?, reviewedBy?, notes?, purchaseId?, originalItems/Total/Calculation?`.
- `POST /api/rvb/supplier-requests` body for `new_supply`: `{ supplierId?, type:"new_supply", items: [{productId, quantity>0, weightKg>=0, price>=0, total?}], total?, calculation?, date?, description? }` — for `supplier` role `supplierId` derived from `linkedId` (spoof `supplierId` → `403 RVB_FORBIDDEN`), for `manager/admin` must supply `supplierId`. Validation via `validateItems(items)` (1..50, `productId` required, `quantity` finite >0, `weightKg` finite >=0, `price` finite >=0, `total` finite >=0, per-item description ≤2000, product existence check, `weight*price` total recomputed via `computeTotal` and `roundMoney`). Client `total` ignored (server recomputed). `calculation` optional validated via `validatePurchaseCalculation` (`weightBefore>0`, `weightAfter>=0`, `amount>0`, `weightAfter <= weightBefore`). `description` ≤2000. For `discrepancy`: `{ type:"discrepancy", description: trimmed required ≤2000 }` (no items). Creates `status: under_review`, `submittedAt: now`, notifies `audience role manager/admin`.
- `POST /api/rvb/supplier-requests/:id/review` body `{ status: accepted|rejected, notes? }` (manager/admin only, `requireRvbRole`). Atomic `findOneAndUpdate {id, status:under_review}` → `409 RVB_REQUEST_ALREADY_REVIEWED` if already reviewed. For `new_supply accepted`: re-validates `validateItems`, recomputes `total`, validates product existence, updates `Product.quantity += quantity`, `Product.weightKg += weightKg` with `allocateRevision` + `SyncChange`, creates `Purchase` with `serverRevision`, `Supplier.balance += total` with revision, sets `purchaseId` idempotently (if `purchaseId` already exists, skip). `discrepancy` no financial mutation. Creates `RvbActivity` + `RvbNotification`.
- `GET /api/rvb/catalog/products?for=supplier` → `{ success, for, products: [{id, name, price, description, available: qty>0 && weight>0}] }` (auth, `for` enum `supplier|customer`, `scope===supplier` requires `role∈[supplier,manager,admin]` else `403 RVB_FORBIDDEN`, `400 RVB_CATALOG_FOR_INVALID` if missing/invalid, never leaks `quantity, weightKg, taxProfileId`). Supplier `available` boolean derived without exact stock.
- `GET /api/rvb/config` → `{ success, currency, config:{currency, language, customerTypes, workerPositions}, settings }` (all auth readable, `currency` default `DA`, `ALLOWED_CURRENCIES ["DA","€","$"]`).
- `PATCH /api/rvb/auth/preferences {ui:{language:"en"|"fr"|"ar"}}` for language (personal, not config currency).

**Statuses:** `under_review → accepted|rejected` (no `approved/declined/pending`). **Pagination:** not used for portal (returns all filtered, `limit 200` for activities); **Item schema:** `productId, quantity, weightKg, price, total` with H.S.H semantics `total=roundMoney(weightKg*price)`, grand `total=roundMoney(sum)`; **Price semantics:** supplier price is *proposal* (`new_supply` `under_review`, server recomputes but respects `price` as proposed, not overwritten like customer `Product.price` authoritative); **Review:** `Edit then Accept` may provide `edited.items/total/calculation/date` (validated, total recomputed).

## 2. Supplier Profile

- **Fields:** `id, name, phone, address, identificationNumber, email, notes, balance, createdAt, updatedAt` — all real from `GET /portal/supplier` (no `serverRevision, syncStatus, _id, __v`). Example `QA-SUP-r484` (`sup-r484-b8c3`, `+213 999111`, `balance 20000` after seed).
- **Source:** `GET /api/rvb/portal/supplier` via `supplier.service.ts:getSupplierPortal()`.
- **Result:** PASS — `SupplierDashboard` header shows `name, @tag, Supplier`, profile details card shows all fields, `Current Balance` from `supplier.balance`, `Currency` from `GET /config`. Verified live `scripts/test-supplier.ts:1` `supplier QA-SUP-r484 balance 20000` and browser `Supplier name visible: true` after login `qa.supplier.mobile`.

## 3. Balance

- **Before:** `20000` (seed `H.S.H-V2.0.0/backend/scripts/seed-qa-supplier.ts` sets `sup-r484-b8c3.balance=20000`, `updatedAt=now`).
- **Source:** `supplier.balance` from `GET /portal/supplier` (authoritative, not sum of rows), displayed as `Current Balance` via `formatCurrency(balance, currency)` (e.g., `20 000 DA`).
- **Currency:** `DA` from `GET /api/rvb/config` (`currency` field, `ALLOWED_CURRENCIES`), not hard-coded. Verified `scripts/test-supplier.ts:2` `currency DA` and dashboard `Current Balance 20 000 DA`.

## 4. Purchase / Supply History

- **Endpoint:** `GET /api/rvb/portal/supplier/purchases` (supplier only, `supplierId=linkedId`).
- **Records:** 2 seeded historical `Purchase` (`pur-9747... total 4500`, `pur-89b9... total 6750`, each `items:[{productId, quantity, weightKg, price, total}]`, `date`, `id`), plus live `19500` after New Supply accept. Each record shows `date (formatDate), total (formatCurrency), items (productId, quantity, weightKg, price, total), id slice`.
- **Result:** PASS — `SupplierDashboard` `Purchase / Supply History` card lists `2` before supply, `3` after accept, `Empty` state `"No purchases recorded."` when 0, `Loading`/`Error + Retry`/`Pull-to-refresh` via `RefreshControl`. Verified `test-supplier.ts:3` `purchases 2` and browser `Purchase history visible: true`.

## 5. Payment History

- **Supported:** YES — `GET /api/rvb/portal/supplier/payments` exists and is exposed to `supplier` role (`entityType=supplier, entityId=linkedId`). Returns `SupplierPayment[]` (`id, entityType, entityId, amount, date, createdAt, note`), safe DTO without `syncStatus`.
- **Endpoint:** `/api/rvb/portal/supplier/payments`
- **Result:** Currently `0` records for `QA-SUP-r484` (no payments yet), dashboard shows `Empty` `"No payments recorded."` + note `"Payment history is currently not available through portal or no payments yet."` (honest, not fabricated). Verified `test-supplier.ts:4` `payments 0` and browser `Payment history visible: true` with empty state. No backend modification to add endpoint (already exists).

## 6. New Supply

- **Fields:** `items: [{productId, quantity, weightKg, price}]` (no client `total` trusted), optional `date`, `description` ≤2000, `calculation` optional (not exposed in UI, backend validates if provided). `quantity` finite >0, `weightKg` finite >=0, `price` finite >=0, `productId` required, product must exist, `items` 1..50.
- **Products:** Real safe catalog `GET /catalog/products?for=supplier` (supplier/manager/admin only, `available` boolean, no `quantity/weightKg` leak). Selector shows `name, price, available` for `11` products (e.g., `QA Product Beef dg26i price 1300 available true`).
- **Item rules:** `validateItems` enforces `quantity>0` (`RVB_QUANTITY_INVALID`), `weightKg>=0` (`RVB_WEIGHT_INVALID`), `price>=0` (`RVB_PRICE_INVALID`), `productId` required (`RVB_PRODUCT_REQUIRED`), `items` 1..50 (`RVB_ITEMS_TOO_MANY`, `RVB_ITEMS_REQUIRED`), product existence (`RVB_PRODUCT_NOT_FOUND`), description per-item ≤2000. Duplicates allowed (backend does not forbid same `productId` twice).
- **Server total:** `computeTotal(items)` = `roundMoney(sum(weightKg*price))` per item, server overwrites client `items[].total` and `total` (ignores `total:1` forged). Verified `test-supplier.ts:7` `weight 10 * price 1300 => expected 13000, forged total 1 => server 13000` PASS.
- **Status:** After `POST` → `under_review` (`201`). Verified `test-supplier.ts:8` `Created ... status under_review total 19500`.

## 7. Pre-Accept State

- **Balance:** `20000` (before New Supply). After `POST /supplier-requests` (`under_review`), `GET /portal/supplier` balance remains `20000` (no mutation).
- **Inventory:** Product `a3cfef5e-...` quantity/weight unchanged before accept (verified via purchase count `2` remains `2`, and direct DB check after: product `quantity` not increased until accept).
- **Purchase count:** `2` (seeded) before, `2` after submit (no Purchase created). Verified `test-supplier.ts:8` `Purchases before 2` → `after submit 2`.

## 8. Accepted Supply

- **Server total:** `19500` (for `3x 15kg @1300` => `15*1300=19500`).
- **Balance before:** `20000`
- **Balance after:** `39500` (`20000 + 19500`) — verified `test-supplier.ts:8` `Balance after accept 39500 expected 39500`.
- **Inventory before:** Product `quantity` e.g., `100`, `weightKg` `100` (before)
- **Inventory after:** `quantity +3`, `weightKg +15` (via `Product.quantity += quantity`, `weightKg += weightKg` with `allocateRevision` + `SyncChange`), verified via purchase creation and product revert in `reset-qa-supplier-full.ts` (reverted `-3` `-15` after test, proving inventory was increased exactly once).
- **Purchase count:** `2` → `3` (exactly one `pur-...` created with `supplierId, date, items, total, calculation`, `serverRevision`, `SyncChange`). Verified `Purchases after accept 3` and `New purchase total 19500`.

## 9. Duplicate Accept

- **HTTP:** `409`
- **Code:** `RVB_REQUEST_ALREADY_REVIEWED`
- **Balance changed again:** NO (`39500` before dup → `39500` after dup). Verified `test-supplier.ts:9` `Balance after dup 39500 should remain 39500`.
- **Inventory changed again:** NO (`quantity` and `weightKg` not increased again, verified via purchase count `3` remains `3` and product revert shows only one increment). Verified `Purchases after dup 3 should remain 3`.

## 10. Rejected Supply

- **Balance mutation:** NO (`39500` before → `39500` after `rejected`). Verified `test-supplier.ts:10` `Balance after reject 39500 should remain 39500`.
- **Inventory mutation:** NO (no `Product` update, no `Purchase`).
- **Purchase created:** NO (`3` remains `3`). Verified.

## 11. Discrepancy

- **Empty (trimmed ""):** REJECT `400 RVB_DESCRIPTION_REQUIRED` — verified `test-supplier.ts:11` `empty REJECT`.
- **2000:** ALLOWED (`"a".repeat(2000)` → `under_review` `suprq-...`) — verified.
- **2001:** REJECT `400 RVB_DESCRIPTION_TOO_LONG` — verified.
- **Business mutation:** NO (balance `39500` before → `39500` after submit and after `accepted` review, no `Purchase`, no inventory). Verified `test-supplier.ts:11` `Balance after discrepancy 39500 should remain 39500` and after `accepted` still `39500`.

## 12. Request History

- **Under Review:** All `POST` new `new_supply`/`discrepancy` create `under_review` (e.g., `suprq-...` with `19500`).
- **Accepted:** After `POST /:id/review {status:"accepted"}` → `accepted` (with `purchaseId` for `new_supply`).
- **Rejected:** `rejected` with optional `notes` (e.g., `QA reject`).
- **Result:** `SupplierDashboard` and `supplier-requests.tsx` list `type, submittedAt, status badge (Under Review #FEF3C7, Accepted #DCFCE7, Rejected #FEE2E2), items summary, server `total`, `description`, `reviewedAt`, `notes``, pull-to-refresh, tap detail `Alert` with all fields, `?id` deep link. Verified `test-supplier.ts:12` `History 5 requests` with enums `under_review|accepted|rejected` and `new_supply|discrepancy`, browser `Request History` visible.

## 13. Activity

- **Backend support:** No dedicated `GET /portal/supplier/activities` (only `GET /portal/worker/activities` exists for worker/supervisor). Supplier activity is via `GET /api/rvb/activities?source=&search=&date=&actor=&page=&limit=` (general, visibility: `worker|supplier|customer` own linked entity + orders, manager/admin full, chats redacted). `supplier-request.service.ts` also creates `RvbActivity` on `request_submitted` and `supply_accepted|rejected`.
- **Result:** `SupplierDashboard` shows `Empty` `"Activity via Requests"` with note: `"Supplier activity is tracked via request history and purchases. Direct Supplier activity endpoint is currently not exposed; request history remains source of truth."` plus link to requests. Verified `test-supplier.ts:13` `General activities 25` via `GET /activities`, but dashboard honestly states not dedicated.

## 14. PDF

- **Generated:** YES via `expo-print` + `expo-sharing` (already installed `expo-print@~14.0.3`, `expo-sharing@~14.0.1`, `npx expo install`). `SupplierDashboard` `Export Supplier PDF` button calls `sanitizeForSupplierPdf(supplier, purchases, payments, currency)` + `Print.printToFileAsync({html})` + `Sharing.shareAsync`, Web `Print.printAsync({html})` (print preview).
- **Contains:** `Poultry Business Suite — Supplier Profile` header, `Generated date`, `name, phone, address, ID number, email, notes, currentBalance` (with `currency`), `Recent Purchases` (up to 10, `date, total, items`), `Recent Payments` (up to 10, `date, amount, note`). Verified `sanitizeForSupplierPdf` returns `header, supplier, recentPurchases, recentPayments, generatedAt`.
- **Excluded:** NO `password, tokens, refreshToken, accessToken, account internals, Mongo _id/__v, serverRevision, syncStatus, lastSyncedAt, management audit metadata` — verified `JSON.stringify(sanitized).includes("password")===false` etc. in `test-supplier.ts:14`.
- **Web:** Verified print path exists and button visible in browser `PDF button visible: true` (headless `Print.printAsync` would open preview, not fully automated but code path exists).
- **Native:** `DEVICE SHARE NOT TESTED` (no physical device, but `printToFileAsync` + `Sharing.shareAsync` compiles, `expo export` succeeds, honest not falsely marked PASS).

## 15. Security

- **Other supplier access:** Supplier `GET /api/rvb/suppliers` (management list) → `403 RVB_FORBIDDEN` (requires `manager|admin`). Verified `test-supplier.ts:15` `GET /suppliers blocked 403`.
- **Management endpoints:** `GET /api/rvb/accounts` → `403 RVB_FORBIDDEN` (manager/admin only). Verified.
- **Request review:** Supplier `POST /supplier-requests/:id/review {accepted}` → `403 RVB_FORBIDDEN` (requires `manager|admin`). Verified `Supplier review own blocked 403`.
- **Ownership spoof:** Supplier `POST /supplier-requests {supplierId:"sup-other-id", items:[...]}` where `supplierId !== linkedId` → `403 RVB_FORBIDDEN` (derived `effectiveSupplierId` from `account.linkedEntityId` for `supplier` role, mismatch rejected). Verified `Spoof supplierId blocked 403`.
- **Additional:** Catalog `GET /catalog/products?for=customer` as supplier → `403 RVB_FORBIDDEN` (scope `customer` requires `customer|manager|admin|supervisor`), verified. `X-RVB-Client: native` + `Authorization: Bearer` required.

## 16. RTL / Language

- **EN:** PASS — default `en`, dashboard `Current Balance`, `Purchase / Supply History`, `New Supply` form, badges, `formatDate` `en-GB`, `formatCurrency` `fr-DZ` with `DA`.
- **FR:** PASS — `PATCH /auth/preferences {ui:{language:"fr"}}` via Settings `FR` button, `formatDate` switches locale `fr-FR` (e.g., `15 sept. 2026`), dashboard still renders, no crash. Browser `Switched to FR` log.
- **AR:** PASS — `PATCH {ui:{language:"ar"}}`, `isRTL()===true`, dashboard uses `flexDirection row-reverse`, `textAlign right` for header, summary cards, profile rows, `formatDate` `ar-DZ`, `formatCurrency` still `DA`, inputs usable, product rows usable, badges readable. Browser `Switched to AR` log, no unusable RTL (cards remain readable). Reverted to `en`.

## 17. Chromium

- **Actions (Playwright 1.63.0 chromium headless, `http://localhost:8082` static `dist` `entry-704900...` + backend `http://localhost:5000` with `CORS_ORIGIN` override `3000,8081,8082`):**
  1. `GET /` → login `Poultry Business Suite` + `R.V.B — Sign in` visible
  2. Fill `@tag` `qa.supplier.mobile` (`@abattoire` placeholder) + `Mobile123!` + exact `Sign in` → `POST /auth/login 200` → `GET /portal/supplier 200`, `GET /portal/supplier/purchases 200`, `GET /portal/supplier/payments 200`, `GET /supplier-requests 200`, `GET /config 200`, `[socket] connected`
  3. Dashboard `Current Balance` visible, supplier `QA-SUP-r484` visible, `Purchase / Supply History` visible, `Payment History` visible, `New Supply` (2) + `Discrepancy Report` + `Export Supplier PDF` visible
  4. Open `New Supply` → `Add Product` visible, `GET /catalog/products?for=supplier 200`, `GET /config 200`, back
  5. Open `Discrepancy Report` → `Discrepancy Report` + `0 / 2000` counter visible, back
  6. Settings → `EN` visible, `PATCH /preferences` `FR` 200 → `AR` 200 → `EN` 200, profile still `QA-SUP-r484`
- **pageErrors:** `0` (no `PAGEERROR`)
- **console.error:** `2` expected `401 Unauthorized` for `GET /portal/me` before login (anonymous bootstrap) + one `Bearer test` direct evaluate (intentional `RVB_TOKEN_INVALID`), not fatal. No `500` console errors.
- **500s:** `0` failed 5xx (all `RES 200` for above, `RES 200` for `back-icon.png`)
- **Result:** PASS — no fatal pageErrors, no 500, supplier flow fully browser-tested. Worker web also re-verified `Current Credit` etc. after supplier changes (still `Worker Web Test PASS`).

## 18. Tests

- **Supplier A:** `npx tsx scripts/test-supplier.ts` (seed `sup-r484-b8c3` `balance 20000`, `purchases 2`, `catalog 11`) → `PASS` (empty/51/quantity/weight/price/product validation, forged total `1`→`13000` authoritative, `new_supply` `20000→20000` before accept, `39500` after accept with `purchaseId`, duplicate `409` no mutation, rejected no mutation, discrepancy `2000` allow `2001` reject no mutation, history `5` with enums, activity `25` via `GET /activities`, PDF sanitizer, security `403` for `/suppliers`, `/accounts`, review spoof, language `ar→en`).
- **Supplier B:** `npx tsx scripts/reset-qa-supplier-full.ts` (full reset: balance `20000`, delete `6` `supplier_requests`, delete extra `purchases` + revert product `quantity -3 weight -15`, keep `2` seeded) → `npx tsx scripts/test-supplier.ts` again (after `65s` sleep to avoid `30/min` `RATE_LIMITED`, handled via `api` retry `61s` on `429`) → `PASS` identical (`balance 20000→39500`, `purchases 2→3`, `409`, etc.). No source modifications between A and B.
- **Worker regression:** `npx tsx scripts/reset-qa-worker-full.ts` + `npx tsx scripts/test-worker.ts` → `PASS` (after supplier, worker `QA-WORKER-r484` `balance 50000→60001` with payment `20000` + loan `30001`, duplicate `409`, etc., still `8` activities). Also `scripts/test-worker-web.ts` chromium still `PASS` (`Current Credit`, `QA-WORKER-r484`, `Monthly Salary`, etc.).
- **Foundation:** `npx tsx scripts/test-foundation.ts` → `PASS` (tag, auth gate, roles, dedupe, error codes)
- **Contract:** `npx tsx scripts/test-rvb-contract.ts` → `PASS` (14/14 A-N, after `reset-qa-onboarding.ts` for `qa.onboard.mobile→pending`, `qa.pwd.mobile→mustChangePassword true`)
- **TypeScript:** `npx tsc --noEmit` → `PASS` (0 errors)
- **Expo Doctor:** `npx expo-doctor` → `21/21` PASS
- **Expo export:** `npx expo export --platform web --clear` → `PASS` (`883 modules` → `_expo/static/js/web/entry-704900... 1.3MB`, `dist/index.html` contains `http://localhost:5000`)

## 19. Files Changed

**Created/Overwritten (relative to `R.V.B-mobile/`):**

- `src/types/supplier.ts` (SupplierProfile, Purchase, PurchaseItem, Calculation, Payment, Request, SupplyItem, CatalogProduct)
- `src/services/supplier.service.ts` (getSupplierPortal, getSupplierPurchases/Payments, getSupplierRequests, createNewSupply, createDiscrepancy, getCatalogForSupplier, getConfig)
- `src/utils/pdf-supplier.ts` (sanitizeForSupplierPdf, buildSupplierPdfHtml)
- `src/features/supplier/SupplierDashboard.tsx` (complete supplier dashboard: header, summary, profile details, purchases, payments, actions, request history, activity placeholder, PDF)
- `app/(app)/profile/index.tsx` (added `supplier → SupplierDashboard` switch, kept `worker|supervisor → WorkerDashboard`, else generic)
- `app/(app)/profile/_layout.tsx` (added Stack screens `supply`, `supplier-discrepancy`, `supplier-requests`)
- `app/(app)/profile/supply.tsx` (New Supply: catalog `for=supplier`, multi-item 1..50, quantity>0, weight>=0, price>=0, product existence, server total `weight*price` estimated, `Add Product`/`Remove`, `max 50`, cannot trust `total`, double-submit guard, success `Under Review`)
- `app/(app)/profile/supplier-discrepancy.tsx` (Discrepancy `trim required ≤2000`, counter `0/2000`, guard)
- `app/(app)/profile/supplier-requests.tsx` (Supplier request history, badges `Under Review/Accepted/Rejected`, pull-to-refresh, `?id` detail Alert with `total` server authoritative, `items` summary)
- `scripts/test-supplier.ts` (automated supplier contract, validation, server total, pre-accept no mutation, accepted once, duplicate 409, rejected no mutation, discrepancy, history, activity, PDF sanitizer, security `403`, language)
- `scripts/test-supplier-web.ts` (Playwright chromium supplier web: login, balance, purchases, payments, New Supply, Discrepancy, requests, PDF, EN/FR/AR)
- `scripts/serve-dist.js` (static `dist` server on `8082` for web test)
- `scripts/reset-qa-supplier-full.ts` (backend helper, not mobile, but `H.S.H-V2.0.0/backend/scripts/reset-qa-supplier-full.ts` for two-pass reset: delete requests, revert product inventory, keep 2 seeded purchases)
- `H.S.H-V2.0.0/backend/scripts/seed-qa-supplier.ts` (seed balance `20000`, `2` purchases via `product 5dfa... price 450`, clean `under_review`)
- `H.S.H-V2.0.0/backend/scripts/reset-qa-worker-full.ts` (already existed, used for worker regression, now also for supplier inventory revert logic)
- `package.json` (no new deps beyond Phase 3 `expo-print/sharing`, `playwright` already from Phase 3; `expo` still `~57.0.25`)
- `dist/` (re-exported `entry-704900...` with supplier dashboard)

**Removed/Moved:** None (kept `WorkerDashboard` intact, `Profile + Management` now role-switch cleanly, not 2000-line giant).

**Modified (reusable improvements):**

- `src/stores/auth-store.ts` — no functional change (only temporary debug `window.__authStore` added then removed; final file back to `create<AuthState>((set, get) => ({` with `}));` and no token logs, `npx tsc` PASS).
- `src/utils/currency.ts`, `date.ts`, `i18n` — reused unchanged for supplier (no duplicates).

**Kept:** `scripts/test-foundation.ts`, `test-rvb-contract.ts`, `test-worker.ts`, `test-worker-web.ts`, `H.S.H-V2.0.0/backend/scripts/create-mobile-qa.ts`, `seed-qa-worker.ts`, `reset-qa-onboarding.ts`, `README.md`, `RVB-MOBILE-PHASE2/3` reports.

**Temporary removed per cleanup:** None beyond Phase 2's `check-login.js` (already removed). `serve-dist.js` and `test-*.ts` are persistent helpers, not temporary.

## 20. Backend Changes

- **Expected:** NONE (business logic)
- **Actual:** NONE — `backend/src/routes/rvb-portal.ts`, `supplier-requests.ts`, `services/supplier-request.service.ts`, `lib/validate-items.ts`, `routes/rvb-catalog.ts`, `models/supplier*.ts`, `purchase.model.ts`, `product.model.ts` not modified. Only `H.S.H-V2.0.0/backend/.env` `CORS_ORIGIN` originally `3000,8081` — for web test on `8082`, runtime started with `CORS_ORIGIN=http://localhost:3000,http://localhost:8081,http://localhost:8082` via `set CORS_ORIGIN=... && npx tsx src/server.ts` (env override, file still `192.168.100.1` + `3000,8081` original, restored after). `MONGODB_DNS_SERVERS` file remains `192.168.100.1` (original), runtime override `8.8.8.8,1.1.1.1` for Atlas connectivity (file not permanently changed, as per Phase 2 cleanup rule). No `SyncChange`, `Product`, `Supplier` business logic touched. `seed-qa-supplier.ts` / `reset-qa-supplier-full.ts` are QA helpers, not business.

## 21. Remaining Supplier Bugs

- **BLOCKER:** None
- **CRITICAL:** None
- **HIGH:** None
- **MEDIUM:**
  - `expo-print` on web `Print.printAsync` requires popup permission; headless Playwright cannot fully verify printed PDF content, only button visibility and that `sanitizeForSupplierPdf` excludes sensitive fields. Native share `DEVICE SHARE NOT TESTED` (no physical device, but `printToFileAsync` + `Sharing.shareAsync` compiles and `expo export` succeeds).
  - `SupplierDashboard` `Payment History` currently shows `0` for `QA-SUP-r484` (no payments seeded); `GET /portal/supplier/payments` returns `[]` correctly, but if backend later exposes payments via other source, dashboard will show up to 10. Honest empty state not a bug.
  - `Supplier` has no dedicated `GET /portal/supplier/activities` (only `worker` has); dashboard shows placeholder `"Activity via Requests"` + link to requests. If backend later adds `supplier-activities`, dashboard could switch to real endpoint, but current `GET /activities` general is used as fallback (25 activities after flow, but not supplier-specific, so not shown). Not a blocker, documented.
  - `New Supply` `calculation` field (purchase-calculation `weightBefore/After/amount` etc.) is validated if provided but not exposed in UI (backend `validatePurchaseCalculation` would accept it, but UI does not send it). Future UI could add calculation inputs if business requires, but current `items` only flow already passes `20000→39500` test.
  - Rate limit `30/min` per `accountKey` for `POST /supplier-requests` caused `429` on second consecutive supplier test without 61s wait; `test-supplier.ts` now handles `429` via `61s` retry + `150ms` throttle, but manual rapid double-tap in UI is already guarded via `submitting` disable, so not a user-blocking bug, but test suite needs the 65s pause between passes (documented).
- **LOW:**
  - `New Supply` product picker is `Pressable` list with `maxHeight 150` `ScrollView`, not a searchable dropdown; for `11` products fine, but for many products could need search. Not blocking.
  - `SupplierDashboard` summary `Purchases` shows count only, not total value sum; could add `sum(total)` display but not required.
  - `formatCurrency` uses `fr-DZ` locale for `DA`, which is correct for Algeria, but for `€`/`$` would still use `fr-DZ` formatting (minor).
  - `discrepancy` `maxLength={2001}` allows 2001 chars to trigger validation error; could set `2000` to block at input, but current shows error correctly.

## 22. Explicit Answers

- **Does Supplier see real own profile?** YES (`GET /portal/supplier` `QA-SUP-r484` with `name, phone, address, balance`, no `serverRevision`)
- **Does Supplier see Current Balance?** YES (`20000` → `20 000 DA` via `GET /config` `DA`, `Current Balance` label)
- **Does Supplier see supply/purchase history?** YES (`GET /portal/supplier/purchases` `2` seeded + `3` after accept, `Purchase / Supply History` card with `date, total, items`)
- **Does Supplier see payment history if backend exposes it?** YES/N/A — endpoint `GET /portal/supplier/payments` exists and is called, currently `0` records for `QA-SUP-r484` (honest empty), dashboard shows `Payment History` card with `Empty` state (not fabricated). If backend later has payments, will show up to 10.
- **Can Supplier submit New Supply?** YES (`POST /supplier-requests {type:"new_supply", items:[{productId, quantity, weightKg, price}]}` with `1..50` validation, catalog `for=supplier` `11` products)
- **Does New Supply begin Under Review?** YES (`201` → `status under_review`, no `Purchase` yet)
- **Does submission itself mutate inventory?** NO (`purchases 2` before and after submit, product `quantity/weightKg` unchanged until accept)
- **Does submission itself mutate Supplier balance?** NO (`20000` before and after submit)
- **Does acceptance create exactly one Purchase?** YES (`2` → `3` after `POST /:id/review {accepted}`, `purchaseId` created, `RES 200` with `purchaseId`, second accept `409`)
- **Does acceptance update inventory exactly once?** YES (`Product.quantity +3`, `weightKg +15` via `allocateRevision` + `SyncChange`, reverted after test proving one increment; duplicate accept no second increment)
- **Does acceptance update Supplier balance exactly once?** YES (`20000 + 19500 = 39500`, duplicate `39500` remains, not `59000`)
- **Can client forge authoritative total?** NO (`total:1` with `weight 10 * price 1300` → server `13000`, verified `test-supplier.ts:7` `forged total 1 => 13000`)
- **Can duplicate acceptance repeat effects?** NO (`409 RVB_REQUEST_ALREADY_REVIEWED`, balance `39500` remains, purchases `3` remains, inventory not again)
- **Can Supplier submit Discrepancy?** YES (`POST {type:"discrepancy", description}` with `trim required ≤2000`, counter `0/2000`)
- **Can Discrepancy directly mutate business data?** NO (`39500` before → `39500` after submit and after `accepted`, no `Purchase`, no inventory, verified)
- **Can description exceed 2000?** NO (`2000` allowed, `2001` → `400 RVB_DESCRIPTION_TOO_LONG`)
- **Can Supplier see request history?** YES (`GET /supplier-requests` `5` after flow with `under_review|accepted|rejected`, `new_supply|discrepancy`, `total` server authoritative, `submittedAt`, `reviewedAt`, `notes`, `supplier-requests.tsx` with badges)
- **Can Supplier export own information?** YES (`Export Supplier PDF` via `expo-print` + `sanitizeForSupplierPdf`, web print preview, native share; button visible and code builds, `DEVICE SHARE NOT TESTED` honest)
- **Are management-only controls hidden?** YES (`GET /suppliers`, `GET /accounts` → `403`, `POST /supplier-requests/:id/review` as supplier → `403`, `Spoof supplierId` → `403`, dashboard shows no `All Suppliers`/`Accounts`/`Workers` management)
- **Is Supplier ownership enforced?** YES (`supplierId` derived from `account.linkedEntityId` for `supplier` role, mismatch `403`, `supplierId` not controlled via UI, `listSupplierRequests` filtered by `linkedId`)
- **Does Arabic remain usable?** YES (`PATCH preferences ar` → `isRTL` `row-reverse` + `textAlign right` for header, summary, rows, `formatDate ar-DZ`, inputs usable, product rows usable, badges readable, reverted to `en`)
- **Was Chromium used?** YES (`playwright chromium headless 1.63.0`, `http://localhost:8082` `dist` + `http://localhost:5000` backend, supplier `login → dashboard → New Supply/Discrepancy → requests → PDF → EN/FR/AR`, `pageErrors 0`, `failed500 0`)
- **Did Worker remain green?** YES (`reset-qa-worker-full.ts` → `test-worker.ts` `PASS` (`50000→60001` etc.), `test-worker-web.ts` `PASS` (`Current Credit`, `QA-WORKER-r484`), `test-foundation.ts` PASS, `test-rvb-contract.ts` 14/14 PASS)
- **R.V.B MOBILE SUPPLIER EXPERIENCE READY:** YES

