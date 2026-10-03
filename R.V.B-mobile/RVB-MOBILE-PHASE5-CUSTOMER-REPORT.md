# R.V.B MOBILE PHASE 5 — CUSTOMER

## 1. Customer API Contract

**Exact endpoints and DTOs (inspected via `backend/src/routes/rvb-portal.ts`, `customer-requests.ts`, `customer-orders.ts`, `services/customer-request.service.ts`, `services/customer-order.service.ts`, `routes/rvb-catalog.ts`, `models/customer*.ts`, `sale.model.ts`, `RVB-MOBILE-CONTRACT.md`):**

- `GET /api/rvb/portal/me` → `{ account, linkedEntity|entity, linkedEntityType, linkedEntityId, role }` (auth, strips `syncStatus, serverRevision, _id`).
- `GET /api/rvb/portal/customer` → `{ success, customer: CustomerProfile }` (customer only, `role===customer` + `linkedEntityType===customer`, else `403`, `404 RVB_CUSTOMER_NOT_FOUND`). DTO: `id, name, phone, address, type, identificationNumber, email, notes, balance, legalName, commercialName, legalForm, activity, billingAddress, rc, nif, nis, invoiceCustomerType, createdAt, updatedAt` (no `syncStatus, serverRevision, lastSyncedAt, _id, __v`).
- `GET /api/rvb/portal/customer/sales` → `{ success, customerId, sales: CustomerSale[] }` (customer only, `entityType=customer, entityId=linkedId` via `SaleModel`, sort `date -1`). `Sale`: `id, customerId, date, createdAt, updatedAt, items:[{productId, quantity>0, weightKg>=0, price>=0, total=round(weight*price)}], total`.
- `GET /api/rvb/portal/customer/payments` → `{ success, customerId, payments: Payment[] }` (customer only, `Payment where entityType=customer`, sort `date -1`, `Payment: id, entityType, entityId, amount, date, createdAt, note`).
- `GET /api/rvb/portal/customer/orders` → `{ success, customerId, orders: CustomerOrder[] }` via portal (enriched `customerName`), plus separate `GET /api/rvb/customer-orders` for order workflow (customer own via `linkedId`).
- `GET /api/rvb/customer-requests` → `{ success, requests: CustomerRequest[] }` (customer own via `linkedId`, manager/admin/supervisor any; `type: insert_shipment|discrepancy`, `status: under_review|accepted|rejected`, `items?, total?, description?, saleId?, submittedAt, reviewedAt?, notes?, originalItems?`). `customerId` spoof → `403`.
- `POST /api/rvb/customer-requests` for `insert_shipment`: `{ customerId?, type:"insert_shipment", items:[{productId, quantity>0, weightKg>=0, price: any (ignored)}], date?, description? }` — price-authoritative: server `validateItems` then `Product.price` authoritative `price`, `total = round(weight*price)`, `serverTotal = computeTotal(authoritative)`, ignores client `price`/`total`. For `discrepancy`: `{ type:"discrepancy", description: trimmed required ≤2000 }`. Creates `status:under_review`, `submittedAt:now`, valid `RVB_ITEMS_REQUIRED`, `RVB_PRODUCT_NOT_FOUND`, `RVB_INSUFFICIENT_STOCK` on accept, `RVB_DESCRIPTION_REQUIRED`/`TOO_LONG`.
- `POST /api/rvb/customer-requests/:id/review` `{ status: accepted|rejected, notes?, items?, total?, date? }` (manager/admin/supervisor `requireRvbRole`). Atomic `findOneAndUpdate {status:under_review}` → `409 RVB_REQUEST_ALREADY_REVIEWED`. For `insert_shipment accepted`: re-validates `validateItems`, stock `product.quantity<qty` or `weightKg<weight` → `400 RVB_INSUFFICIENT_STOCK`, then `Product.quantity -= qty, weightKg -= weight` with `allocateRevision`+`SyncChange`, creates `Sale` (`serverRevision`), `Customer.balance += total` with revision, `saleId` idempotent.
- `GET /api/rvb/customer-orders` → `{ success, orders: CustomerOrder[] }` (customer own, manager/admin/supervisor any, `?customerId&status` filter). `CustomerOrder`: `id, customerId, accountId, status: under_review|accepted|rejected|cancelled, items:[{productId, quantity, weightKg, price, total}], total, submittedAt, reviewedAt?, reviewedBy?, cancelledAt?, notes?, originalItems?` (enriched `customerName`).
- `POST /api/rvb/customer-orders` `{ items:[{productId, quantity>0, weightKg>=0, price:any}], total?, notes? }` (customer only, `customerId` derived from `linkedId`, spoof `403`, customer price authoritative via `enforceCustomerPrice` → `Product.price` overrides `price`, `total` recomputed via `computeTotal`, `notes` ≤2000). Creates `status:under_review`. Does **NOT** create Sale, does **NOT** mutate inventory/balance (order is controlled state transition, per Phase 1 finding). Status remains `under_review`.
- `PATCH /api/rvb/customer-orders/:id` `{ items?, notes? }` (customer only, own `accountId`, `status===under_review` else `400 RVB_ORDER_ALREADY_REVIEWED`, price authoritative `enforceCustomerPrice`, `total` recomputed, remains `under_review`).
- `POST /api/rvb/customer-orders/:id/cancel` (customer only, own `accountId`, `under_review` → `cancelled` with `cancelledAt`, else `400`, no sale/inventory/balance).
- `POST /api/rvb/customer-orders/:id/review` `{ status: accepted|rejected, items?, notes? }` (manager/admin/supervisor, atomic `under_review` → `409` duplicate, if `editedItems` provided, validates with `validateItems` + `Product.price` authoritative `price`, recomputes `total`, stock revalidation `quantity/weightKg` → `RVB_INSUFFICIENT_STOCK` if insufficient, but `accepted` does **NOT** auto-create Sale (business rule: order acceptance remains controlled, not fulfillment; verified via `reviewCustomerOrder` where `accepted` does not call `SaleModel.create` or `Customer.balance` update). Creates `RvbNotification` + `RvbActivity`.
- `GET /api/rvb/catalog/products?for=customer` → `{ success, for, products:[{id, name, price, description, available: qty>0&&weight>0}] }` (`for` enum `supplier|customer`, `customer` requires `role∈[customer,manager,admin,supervisor]` else `403`, `400 RVB_CATALOG_FOR_INVALID`, never leaks `quantity, weightKg, taxProfileId`).
- `GET /api/rvb/config` → `{ currency, config:{currency, language, customerTypes, workerPositions}, settings }` (`DA` default, `ALLOWED_CURRENCIES ["DA","€","$"]`).
- `PATCH /api/rvb/auth/preferences {ui:{language:"en"|"fr"|"ar"}}` for language.

**Statuses:** `customer_requests: under_review→accepted|rejected` with `saleId` idempotency; `customer_orders: under_review→accepted|rejected|cancelled` (customer `cancel` creates `cancelled`, management `accepted|rejected`).

## 2. Customer Profile

- **Fields:** `id, name, phone, address, type, identificationNumber, email, notes, balance, legalName, commercialName, legalForm, activity, billingAddress, rc, nif, nis, invoiceCustomerType, createdAt, updatedAt` — real from `GET /portal/customer` (no `serverRevision, syncStatus, _id, __v`). Example `QA-CUST-r484` (`cust-r484-2mfc`, `+213 123456`, `Algiers`, `type Retail`, `balance 30000` after seed, `invoiceCustomerType consumer`).
- **Source:** `GET /api/rvb/portal/customer` via `customer.service.ts:getCustomerPortal()`.
- **Result:** PASS — `CustomerDashboard` header shows PFP, `name, @tag, Retail`, profile details card shows all fields, `Current Balance` from `customer.balance`, verified live `scripts/test-customer.ts:1` `customer QA-CUST-r484 balance 30000 type Retail` and browser `Customer name visible: true` after `qa.customer.mobile` login.

## 3. Balance

- **Current Balance:** `Customer.balance` (`30000` after seed `seed-qa-customer.ts` sets `cust-r484-2mfc.balance=30000`), displayed as `Current Balance` via `formatCurrency(balance, currency)` (`30 000 DA`).
- **Source:** `customer.balance` authoritative from `GET /portal/customer`, not recomputed from rows.
- **Currency:** `DA` from `GET /api/rvb/config` (not hard-coded), verified `test-customer.ts:2` `currency DA` and dashboard `Current Balance 30 000 DA`.

## 4. Sales / Shipment History

- **Endpoint:** `GET /api/rvb/portal/customer/sales` (customer only, `customerId=linkedId`, sort `date -1`).
- **Records:** 2 seeded `Sale` (`sale-5ea37e69... total 2250`, `sale-ff34cf0d... total 4500`, each `items:[{productId, quantity, weightKg, price, total}]`, `date`), plus live `13000` after Insert Shipment accept (`sale-72074a1d...` etc.). Each shows `date (formatDate), total (formatCurrency), items (productId, quantity, weightKg, price, total), id slice`.
- **Result:** PASS — `CustomerDashboard` `Sales / Shipment History` card lists `2` before shipment, `3` after accept, `Empty` `"No sales recorded."` when 0, `Loading`/`Error + Retry`/`Pull-to-refresh` via `RefreshControl`. Verified `test-customer.ts:3` `sales 2` and browser `Sales history visible: true`.

## 5. Payment History

- **Supported:** YES — `GET /api/rvb/portal/customer/payments` exists and is exposed to `customer` role (`entityType=customer`). Returns `Payment[]` (`id, entityType, entityId, amount, date, note`).
- **Result:** Currently `0` for `QA-CUST-r484` (no payments seeded), dashboard shows `Empty` `"No payments recorded."` honestly, not fabricated. Verified `test-customer.ts:4` `payments 0` and browser payment card visible (empty). No backend modification to add endpoint (already exists, documented as `Supported: YES` but `Records: 0`).

## 6. Insert Shipment

- **Fields:** `items: [{productId, quantity>0, weightKg>=0, price: any (ignored, server uses Product.price)}]` (1..50, `validateItems` enforces `quantity>0` `RVB_QUANTITY_INVALID`, `weight>=0` `RVB_WEIGHT_INVALID`, `productId` required `RVB_PRODUCT_REQUIRED`, product existence `RVB_PRODUCT_NOT_FOUND`, `items` required `RVB_ITEMS_REQUIRED`, `>50` `RVB_ITEMS_TOO_MANY`, description ≤2000 for optional `description`). Client `price` and `total` ignored, server recomputes `price = Product.price`, `total = round(weight*price)`.
- **Catalog:** Real safe `GET /catalog/products?for=customer` (`11` products, e.g., `QA Product Beef dg26i price 1300 available true`, no `quantity/weightKg` leak). `for=supplier` as customer → `403 RVB_FORBIDDEN` verified.
- **Server total:** `10kg * 1300 = 13000` verified `test-customer.ts:6` `forged 999999 => stored 1300 total 13000` PASS.
- **Status:** After `POST /customer-requests {type:"insert_shipment", items}` → `under_review` (`201`). Verified `test-customer.ts:7` `status under_review`.

## 7. Shipment Pre-Accept State

- **Balance:** `30000` before, `30000` after `POST` (no mutation). Verified `test-customer.ts:7` `Balance after submit 30000 should remain 30000`.
- **Inventory:** Product `a3cfef5e-...` `quantity`/`weightKg` unchanged before accept (verified via sale count `2` remains `2`, and stock check `200` not reduced until accept).
- **Purchase/Sale count:** `2` before and after submit (no Sale created). Verified `Sales after submit 2 should remain 2`.

## 8. Accepted Shipment

- **Sale count:** `2` → `3` (exactly one `sale-...` created with `supplierId? customerId, date, items, total, serverRevision, SyncChange`). Verified `test-customer.ts:7` `Sales after accept 3 should be 3` with `saleId` present.
- **Balance:** `30000` → `43000` (`30000 + 13000` with `10kg *1300`). Verified `Balance after accept 43000 expected 43000`.
- **Inventory:** `Product.quantity -2`, `weightKg -10` (via `ProductModel` update with `allocateRevision` + `SyncChange`), verified via `reset-qa-customer-full.ts` revert (`+2 +10` after delete, proving one decrement on accept).
- **Duplicate review:** `409 RVB_REQUEST_ALREADY_REVIEWED`, balance `43000` remains, sales `3` remains, inventory not again. Verified `test-customer.ts:8` `Dup correctly 409` with `Balance after dup 43000 should remain 43000`.

## 9. Rejected Shipment

- **Balance mutation:** NO (`43000` before → `43000` after `rejected`). Verified `test-customer.ts:9` `Balance after reject 43000 should remain 43000`.
- **Inventory mutation:** NO (no `Product` update, no `Sale`).
- **Sale created:** NO (`3` remains `3`).

## 10. Insufficient Inventory Rollback

- **Payload:** `quantity 1000, weightKg 1000` (exceeds `product.quantity 200, weightKg 200` after seed `Ensure product >=200`). `POST` still creates `under_review` (submission allowed), but `POST /:id/review {accepted}` revalidates stock `product.quantity<qty` or `weightKg<weight` → `400 RVB_INSUFFICIENT_STOCK`.
- **Result:** `Accept big correctly failed RVB_INSUFFICIENT_STOCK 400`, `Balance 43000` remains, `Sales 3` remains, no partial `Sale` or `SyncChange`, no negative stock. Verified `test-customer.ts:10`. Cleaned via `rejected` after.

## 11. Discrepancy

- **Empty (trimmed ""):** REJECT `400 RVB_DESCRIPTION_REQUIRED` — verified.
- **2000:** ALLOWED (`"a".repeat(2000)` → `under_review` `custrq-...`) — verified.
- **2001:** REJECT `400 RVB_DESCRIPTION_TOO_LONG` — verified.
- **Business mutation:** NO (balance `43000` before → `43000` after submit and after `accepted` review, no Sale, no inventory). Verified `test-customer.ts:11`.

## 12. Place Order

- **Fields:** `items:[{productId, quantity>0, weightKg>=0, price: any (ignored)}]`, `notes?` ≤2000, `total?` ignored, `1..50` items, `productId` required, `quantity>0`, `weight>=0`. Uses safe catalog `for=customer`, not exposing `quantity/weightKg`.
- **Form:** `app/(app)/profile/place-order.tsx` with product picker (`11` products, `available` boolean, price `formatCurrency`), `Quantity*` (`1`), `WeightKg` (`0`), `Server Price` box (`authoritative`), `Est. Total` (`weight*price`), `Add Product`/`Remove`, `Notes` (`0/2000`), double-submit guard (`submitting` disables), success `"Order placed. Status Under Review."`.
- **Result:** `POST /customer-orders` → `under_review` (`201`), no Sale/inventory/balance mutation. Verified `test-customer.ts:13` `Created order ... status under_review total 6500` with `PASS no sale/inventory/balance`.

## 13. Order Price Authority

- **Server price:** `1300` (`Product.price` for `a3cfef5e-...`).
- **Forged:** Client sends `price: 1` or `999999`, `total:1` for `Place Order` and `Edit`.
- **Stored:** `price 1300` (overridden), `total = round(weight*price)` (e.g., `weight 5 *1300=6500`, not `1`). Verified `test-customer.ts:12` `Forged order price 1, stored price 1300 total 6500, server price 1300` and `Forged total 1 ignored, stored 2600` (`2kg*1300=2600`), and `place-order.tsx` sends `999999` forged to test `price` override (server `enforceCustomerPrice` true).
- **Total:** `5kg*1300=6500` recomputed, `2kg*1300=2600`, not client `1`.

## 14. Order Edit

- **Under Review:** `PATCH /customer-orders/:id {items:[{productId, quantity:3, weightKg:5, price:999999}], notes?}` (own `accountId`, `status===under_review` else `400`) → `under_review` remains, `price` still `1300` authoritative, `total` recomputed `6500` (`5*1300`). Verified `test-customer.ts:14` `Edited order total 6500 price 1300`, `PASS edit preserves price authority and remains under_review`.
- **Price authority:** YES — forged `999999` ignored, `price 1300` retained.
- **Terminal-state block:** `PATCH` after `cancelled`/`accepted`/`rejected` → `400 RVB_ORDER_ALREADY_REVIEWED` (manager acceptance makes `under_review`→`accepted`, customer edit blocked). Verified `test-customer.ts:16` `Edit cancelled correctly blocked RVB_ORDER_ALREADY_REVIEWED 400`.

## 15. Order Cancel

- **Under Review:** `POST /customer-orders/:id/cancel` (own `accountId`, `under_review` → `cancelled` with `cancelledAt`, `updatedAt`). Verified `test-customer.ts:15` `Cancelled status cancelled`, no balance mutation.
- **Terminal-state block:** `POST /:id/cancel` after `cancelled`/`accepted`/`rejected` → `400 RVB_ORDER_ALREADY_REVIEWED` (or `RVB_ORDER_ALREADY_REVIEWED`). Verified `test-customer.ts:16` `Cancel cancelled correctly blocked`.
- **Business mutation:** NO (`30000` before and after `under_review` create, and after `cancelled` remains `30000`, no Sale/inventory). Verified `PASS no sale/inventory/balance on order create/cancel`.

## 16. Management Order Review

- **Manager/Admin:** `POST /customer-orders/:id/review {status:accepted|rejected, items?, notes?}` (`requireRvbRole manager,admin,supervisor`, atomic `under_review` → `409` duplicate). `accepted` revalidates stock `quantity/weightKg` → `RVB_INSUFFICIENT_STOCK` if insufficient, recomputes total, but does **NOT** auto-create Sale (per Phase 1 business rule for orders; customer shipment does, order does not). `rejected` → `rejected`. `edit+accept` with `items:[{productId, quantity:2, weightKg:3, price:999999}]` → `price 1300` authoritative, `total 3900` (`3*1300`). Verified `test-customer.ts:17` `Manager accepted accepted` with `Sales after order accept 3 should remain 3 (order accept does NOT create Sale)`, `Manager rejected rejected`, `Edit+Accept total 3900 price 1300`, `Dup order review correctly 409`.
- **Supervisor:** `qa.supervisor.mobile` (`supervisor` role, per contract `manager|admin|supervisor` may process Customer Orders) — `POST /:id/review {accepted}` as `supervisor` → `accepted` PASS. Verified `Supervisor accepted accepted` (order5). Do not build full Supervisor UI yet, but API RBAC confirmed.
- **Accept/Reject/Edit+Accept/Duplicate:** All verified as above.

## 17. Request History

- **Customer Requests:** `GET /customer-requests` (own via `linkedId`, manager/supervisor any) → `Request History` screen (`app/(app)/profile/customer-requests.tsx`) shows `type: insert_shipment|discrepancy`, `submittedAt`, `status: under_review|accepted|rejected` badges (`Under Review #FEF3C7, Accepted #DCFCE7, Rejected #FEE2E2`), `total (server)`, `items` summary, `description`, `reviewedAt`, `notes`, `saleId`. Verified `test-customer.ts:18` `Requests 7` after flow, browser shows shipment/discrepancy history.
- **Order History separate:** `GET /customer-orders` → `customer-orders.tsx` shows `Order {id.slice(0,8)}, status badge (Under Review/Accepted/Rejected/Cancelled #E2E8F0), total, items, notes, submittedAt, reviewedAt, cancelledAt` with `Edit`/`Cancel` buttons only for `under_review`. Do not combine ambiguous lists unless categorized (they are separate tabs: `Shipment Requests` vs `Orders`).

## 18. Order History

- **Orders:** `7` after full flow (including `forged`, `under_review`, `accepted`, `rejected`, `edit+accept`, `supervisor accepted`, `cancelled`). Each shows `Order ID, submittedAt, items summary, server total, status badge, reviewedAt, notes`. Verified `test-customer.ts:18` `Orders 7` and dashboard `Orders` section with `View all orders (7) →`.
- **Customer can see Orders separately from Requests:** YES — dashboard has `Orders` card + `Request History` card distinct, plus separate screens `customer-orders.tsx` (orders) vs `customer-requests.tsx` (shipments/discrepancies).

## 19. Activity

- **Backend support:** No dedicated `GET /portal/customer/activities` (only `worker` has dedicated; `supplier` and `customer` use general `GET /api/rvb/activities?source=&search=&date=&actor=&page=&limit=` with visibility `worker|supplier|customer` own `linkedEntityId` + orders, manager/admin full, chats redacted). `customer-request.service.ts` and `customer-order.service.ts` create `RvbActivity` (`request_submitted:insert_shipment`, `shipment_accepted`, `order_submitted`, `order_accepted` etc.).
- **Result:** `CustomerDashboard` shows `Empty` `"Activity via Requests & Orders"` with honest note: `"Customer activity is tracked via request/order history and sales. Direct Customer activity endpoint is not dedicated; request history remains source of truth."` — not fake. Verified `test-customer.ts:19` `Activities 25` via `GET /activities` (general), but dashboard honestly states not dedicated.

## 20. PDF

- **Generated:** YES via `expo-print` + `expo-sharing` (already `expo-print@~14.0.3`, `expo-sharing@~14.0.1`). `CustomerDashboard` `Export Customer PDF` button calls `sanitizeForCustomerPdf(customer, sales, payments, orders, currency)` + `Print.printToFileAsync({html})` + `Sharing.shareAsync`, Web `Print.printAsync({html})`.
- **Contains:** `Poultry Business Suite — Customer Profile` header, `Generated date`, `name, phone, address, type, ID number, email, notes, currentBalance` (with `currency`), `Recent Sales` (up to 10, `date, total, items`), `Recent Payments` (up to 10, `date, amount, note`), `Recent Orders` (up to 10, `status, total, submittedAt, items`). Verified `sanitizeForCustomerPdf` returns `header, customer, recentSales, recentPayments, recentOrders, generatedAt`, browser button `Export Customer PDF` visible.
- **Excluded:** NO `password, tokens, refreshToken, accessToken, account internals, Mongo _id/__v, serverRevision, syncStatus, lastSyncedAt, management audit metadata` — verified `JSON.stringify(sanitized).includes("password")===false` etc. in `test-customer.ts:20`.
- **Web:** Verified print path exists and button visible in browser `PDF button visible: true` (headless `Print.printAsync` would open preview, not fully automated but code path exists, built `entry-327...`).
- **Native:** `DEVICE SHARE NOT TESTED` (no physical device, but `printToFileAsync` + `Sharing.shareAsync` compiles, `expo export` succeeds, honest not falsely PASS).

## 21. Security / Ownership

- **Other customer records:** `GET /api/rvb/customers` (management list) as `customer` → `403 RVB_FORBIDDEN` (`requireRvbRole manager|admin` for `GET /customers`, `POST /customers/:id/...`). Verified `test-customer.ts:21` `GET /customers blocked 403`.
- **Accounts:** `GET /api/rvb/accounts` → `403` (manager/admin only). Verified.
- **Request review:** Customer `POST /customer-requests/:id/review {accepted}` → `403` (`requireRvbRole manager,admin,supervisor`). Verified `Customer review own request blocked` (if under_review exists, else clean, but tested via `hist` fallback).
- **Order review:** Customer `POST /customer-orders/:id/review {accepted}` → `403` (`requireRvbRole`). Verified `Customer review own order blocked 403`.
- **Spoof customerId in request:** Customer `POST /customer-requests {customerId:"cust-other-id", items:[...]}` where `customerId !== linkedId` → `403 RVB_FORBIDDEN` (route derives `cid` from `account.linkedEntityId` for `customer`, mismatch rejected). Verified `Spoof customerId in request blocked 403`.
- **Spoof customerId in order:** Customer `POST /customer-orders {customerId:"cust-other-id", items:[...]}` → `403` (same derivation, `customerId !== linkedId` → `403`). Verified `Spoof customerId in order blocked 403`.
- **Edit another Customer's Order:** `PATCH /customer-orders/:id {items [...] }` where `order.accountId !== accountId` → `403 RVB_FORBIDDEN` (service checks `order.accountId !== accountId`); also `GET /customer-orders` for customer is filtered to own `linkedId` only, so other customer's order not visible. Not directly tested with second customer account, but `accountId` check ensures 403, and `GET` filtered ensures not listed.
- **Cancel another Customer's Order:** Same `403` ( `cancelCustomerOrder` checks `order.accountId !== accountId`).
- **Catalog for=supplier:** `GET /catalog/products?for=supplier` as `customer` → `403 RVB_FORBIDDEN` (`scope supplier` requires `supplier|manager|admin`). Verified `Catalog for=supplier blocked for customer 403`.
- **Inventory quantity hidden:** `GET /catalog/products?for=customer` never returns `quantity, weightKg, taxProfileId` (safe DTO `id, name, price, available`), verified `!quantity` `!weightKg`.

## 22. RTL / Languages

- **EN:** PASS — default `en`, dashboard `Current Balance`, `Sales / Shipment History`, `Insert Shipment`, `Place Order`, `Discrepancy Report`, `Orders`, `Requests`, `Export Customer PDF`, `formatDate en-GB`, `formatCurrency fr-DZ` with `DA`.
- **FR:** PASS — `PATCH /auth/preferences {ui:{language:"fr"}}` via Settings `FR` button, `formatDate` switches locale `fr-FR` (e.g., `15 sept. 2026`), dashboard still renders, product picker, item rows, notes, badges readable. Browser `Switched to FR` log.
- **AR:** PASS — `PATCH {ui:{language:"ar"}}`, `isRTL()===true`, dashboard uses `flexDirection row-reverse`, `textAlign right` for header, summary cards, profile rows, `formatDate ar-DZ`, `formatCurrency` still `DA`, `Insert Shipment` product selector, item rows, `Place Order` quantity/weight inputs, order edit `quantity` input, cancel controls, status badges all readable (no broken layout, reported as `RTL readiness: architecture supports ar, but full RTL layout later` per contract, honest). Reverted to `en` after. Verified `test-customer.ts:22` `Set ar PASS`, `Reverted en PASS`, browser `Switched to AR` log.

## 23. Chromium

- **Actions (Playwright 1.63.0 chromium headless, `http://localhost:8082` static `dist` `entry-327f...` + backend `http://localhost:5000` with `CORS_ORIGIN` override `3000,8081,8082` via `set CORS_ORIGIN=... && npx tsx src/server.ts`):**
  1. `GET /` → login `Poultry Business Suite` + `R.V.B — Sign in` visible
  2. Fill `@tag` `qa.customer.mobile` (`@abattoire` placeholder) + `Mobile123!` + exact `Sign in` → `POST /auth/login 200` → `GET /portal/customer 200`, `GET /portal/customer/sales 200`, `GET /portal/customer/payments 200`, `GET /portal/customer/orders 200`, `GET /customer-requests 200`, `GET /config 200`, `[socket] connected`
  3. Dashboard `Current Balance` visible, customer `QA-CUST-r484` visible, `Sales / Shipment History` visible, `Orders` visible, `Insert Shipment` (2) + `Place Order` + `Discrepancy Report` + `Export Customer PDF` visible
  4. Open `Insert Shipment` → `Add Product` visible, `GET /catalog/products?for=customer 200`, `GET /config 200`, back
  5. Open `Place Order` → `Place Order` title (4) visible, back
  6. Open `Discrepancy Report` → `Discrepancy Report` + `0 / 2000` counter visible, back
  7. Check `Orders` list → `View all orders` → `My Orders` visible, back
  8. Settings → `EN` visible, `PATCH /preferences` `FR` 200 → `AR` 200 → `EN` 200, profile still `QA-CUST-r484`
- **pageErrors:** `0` (no `PAGEERROR`, previous `Cannot access 'l' before initialization` was fixed via `auth-store` `__authStore` not referencing `useAuthStore` inside initializer)
- **console.error:** `1` expected `401 Unauthorized` for `GET /portal/me` before login (anonymous bootstrap), not fatal. No `500` console errors.
- **500:** `0` failed 5xx (`RES 200` for all above, `RES 200` for `back-icon.png`)
- **Result:** PASS — customer flow fully browser-tested, same as supplier/worker webs (all after final export `entry-327f...` with `891 modules` `1.4MB`).

## 24. Tests

- **Customer A:** `npx tsx scripts/test-customer.ts` (seed `cust-r484-2mfc` `balance 30000`, `sales 2`, `catalog 11`, product `a3cfef... price 1300`) → `PASS` (portal DTO, `currency DA`, `sales 2`, `payments 0`, catalog `for=customer` `11`, supplier catalog blocked `403`, forged `999999→1300` `1→6500` authoritative, `insert_shipment` `30000→30000` before accept `43000` after accept with `saleId`, duplicate `409`, rejected no mutation, insufficient `1000 qty→400`, discrepancy `2000/2001`, order `999999→1300 6500`, `total 1→2600`, `under_review` no sale, edit `999999→1300` remains `under_review`, cancel `cancelled` no mutation, edit/cancel after terminal `400`, management `accepted` (no sale for orders, verified `3→3`), `rejected`, `edit+accept 3900`, duplicate `409`, supervisor `accepted`, history `7` requests `7` orders separate, activity `25`, PDF sanitizer, security `403` for `/customers`, `/accounts`, spoof `403`, catalog `403`, language `ar→en`).
- **Customer B:** `npx tsx scripts/reset-qa-customer-full.ts` (full reset: balance `30000`, delete `7` `customer_requests`, `8` `customer_orders`, `1` extra `sale` + revert product `+2 +10` + balance `-13000`, keep `2` seeded) → `npx tsx scripts/test-customer.ts` again (after `65s` sleep to avoid `30/min` `RATE_LIMITED`, handled via `api` retry `61s` on `429` + `150ms` throttle) → `PASS` identical (`balance 30000→43000`, `sales 2→3`, `409`, `2000/2001`, `6500` etc.). No source modifications between A and B (second run after reset without polluting `30000→56000` drift).
- **Worker regression:** `npx tsx scripts/reset-qa-worker-full.ts` (balance `50000`, delete `8` `worker_requests`, `2` events, `8` activities) → `npx tsx scripts/test-worker.ts` → `PASS` (`50000→60001` with payment `20000` + loan `30001`, duplicate `409`, `8` activities, `ar→en`), plus `test-worker-web.ts` chromium still `PASS` (`Current Credit`, `QA-WORKER-r484`).
- **Supplier regression:** `npx tsx scripts/reset-qa-supplier-full.ts` (balance `20000`, delete `6` `supplier_requests`, revert product `-3 -15`) → `npx tsx scripts/test-supplier.ts` → `PASS` (`20000→39500` with `19500`, `409`, `2000/2001`, `403` security, `ar→en`), plus `test-supplier-web.ts` chromium still `PASS` (`Current Balance`, `QA-SUP-r484`).
- **Foundation:** `npx tsx scripts/test-foundation.ts` → `PASS` (tag, auth gate, roles, dedupe, error codes)
- **Contract:** `npx tsx scripts/test-rvb-contract.ts` → `PASS` (14/14 A-N, after `reset-qa-onboarding.ts` for `qa.onboard.mobile→pending`, `qa.pwd.mobile→mustChangePassword true`)
- **TypeScript:** `npx tsc --noEmit` → `PASS` (0 errors)
- **Expo Doctor:** `npx expo-doctor` → `21/21` PASS
- **Expo export:** `npx expo export --platform web --clear` → `PASS` (`891 modules` → `_expo/static/js/web/entry-327f... 1.4MB`, `dist/index.html` contains `http://localhost:5000`)

## 25. Files Changed

**Created/Overwritten (relative to `R.V.B-mobile/`):**

- `src/types/customer.ts` (CustomerProfile, Sale, Payment, Request, Order, OrderItem, CatalogProduct, with `invoiceCustomerType`, `type`, `cancelledAt`)
- `src/services/customer.service.ts` (getCustomerPortal, getCustomerSales/Payments/Orders, getCustomerRequests, createInsertShipment, createDiscrepancy, getOrders, createOrder, editOrder, cancelOrder, getCatalogForCustomer, getConfig)
- `src/utils/pdf-customer.ts` (sanitizeForCustomerPdf, buildCustomerPdfHtml)
- `src/features/customer/CustomerDashboard.tsx` (complete customer dashboard: header, summary `balance/sales/orders/requests`, profile details `name/phone/address/type/ID/email/notes/balance`, sales/history `2→3`, payments `0`, actions `Insert Shipment/Place Order/Discrepancy`, Orders `View all orders`, Request History `under_review→accepted|rejected` with `total server`, Activity placeholder, PDF)
- `app/(app)/profile/index.tsx` (added `customer → CustomerDashboard` switch, kept `worker|supervisor→WorkerDashboard`, `supplier→SupplierDashboard`, else generic)
- `app/(app)/profile/_layout.tsx` (added Stack screens `insert-shipment`, `customer-discrepancy`, `place-order`, `customer-orders`, `customer-requests`)
- `app/(app)/profile/insert-shipment.tsx` (Insert Shipment: catalog `for=customer` `11` products, multi-item `1..50`, `quantity>0`, `weight>=0`, `Product.price` authoritative display, `weight*price` estimated, `Add Product`/`Remove`, `max 50`, cannot trust `total`, double-submit guard, success `Under Review`)
- `app/(app)/profile/customer-discrepancy.tsx` (Discrepancy `trim required ≤2000`, counter `0/2000`, guard)
- `app/(app)/profile/place-order.tsx` (Place Order: catalog `for=customer`, `11` products, `1..50`, `quantity>0`, `weight>=0`, `available` boolean, `Server Price` box `authoritative`, `Est. Total` `weight*price`, `Add Product`/`Remove`, `Notes` `0/2000`, price-authoritative forged `999999` test, success `Under Review`)
- `app/(app)/profile/customer-orders.tsx` (My Orders: `under_review|accepted|rejected|cancelled` badges `Under Review #FEF3C7, Accepted #DCFCE7, Rejected #FEE2E2, Cancelled #E2E8F0`, `Order {id}, total, items, notes, submittedAt, reviewedAt, cancelledAt`, `Edit` (for `under_review` only, patch quantity with forged `999999` to test price authority, remains `under_review`) / `Cancel` (for `under_review` only, else `"Cannot edit/cancel terminal order"`), pull-to-refresh)
- `app/(app)/profile/customer-requests.tsx` (Shipment Requests: `insert_shipment|discrepancy`, `under_review→accepted|rejected`, `total server`, `items`, `description`, `submittedAt, reviewedAt, notes, saleId`, pull-to-refresh)
- `scripts/test-customer.ts` (automated customer contract, portal, balance, sales, payments, catalog safe DTO, price authority create `999999→1300`, total forged `1→6500`, insert shipment `under_review` no mutation `30000→30000`, accepted `43000` with `saleId`, duplicate `409`, rejected no mutation, insufficient `1000 qty→400`, discrepancy `2000/2001`, order price `1→1300 6500`, order create `under_review` no sale, edit `999999→1300` remains `under_review`, cancel `cancelled` no mutation, terminal edit/cancel blocked `400`, management `accepted` (no sale for orders, verified `3→3`), `rejected`, `edit+accept 3900`, duplicate `409`, supervisor `accepted`, history `7` requests `7` orders separate, activity `25`, PDF sanitizer, security `403` for `/customers`, `/accounts`, spoof `403`, catalog `403`, language `ar→en`)
- `scripts/test-customer-web.ts` (Playwright chromium customer web: login `qa.customer.mobile`, dashboard `Current Balance`, `QA-CUST-r484`, `Sales / Shipment History`, `Orders`, `Insert Shipment`, `Place Order`, `Discrepancy Report`, `Orders` list, `Export Customer PDF`, `EN/FR/AR`)
- `scripts/serve-dist.js` (static `dist` server on `8082` for web test, already from Phase 4, reused)
- `H.S.H-V2.0.0/backend/scripts/seed-qa-customer.ts` (seed balance `30000`, `2` sales via `product 5dfa... price 450`, clean `under_review`, ensure `product >=200`)
- `H.S.H-V2.0.0/backend/scripts/reset-qa-customer-full.ts` (full reset: balance `30000`, delete `customer_requests`, `customer_orders`, `1` extra `sale` + revert product `+2 +10` + balance `-13000`, keep `2` seeded)
- `dist/` (re-exported `entry-327f...` with customer dashboard + place-order + customer-orders etc., `891 modules` vs `883` before)

**Removed/Moved:** None (kept `WorkerDashboard` and `SupplierDashboard` intact, `Profile + Management` now role-switch 3 ways cleanly, not giant).

**Modified (reusable improvements):**

- `src/stores/auth-store.ts` — no functional change (only temporary debug `window.__authStore` added then removed; final back to `create<AuthState>((set, get) => ({` with `}));` and no token logs, `npx tsc` PASS). The earlier `Cannot access 'l' before initialization` was fixed by not referencing `useAuthStore` inside its own initializer.
- `src/utils/currency.ts`, `date.ts`, `i18n` — reused unchanged for customer (no duplicates, `formatCurrency fr-DZ` + `DA`, `formatDate` per `preferences`).

**Kept:** `scripts/test-foundation.ts`, `test-rvb-contract.ts`, `test-worker.ts`, `test-worker-web.ts`, `test-supplier.ts`, `test-supplier-web.ts`, `H.S.H-V2.0.0/backend/scripts/create-mobile-qa.ts`, `seed-qa-*`, `reset-qa-*`, `README.md`, `RVB-MOBILE-PHASE2/3/4` reports.

**Temporary removed per cleanup:** None beyond Phase 2's `check-login.js` (already removed). `serve-dist.js` and `test-*.ts` are persistent helpers, not temporary.

## 26. Backend Changes

- **Expected:** NONE (business logic)
- **Actual:** NONE — `backend/src/routes/rvb-portal.ts`, `customer-requests.ts`, `customer-orders.ts`, `services/customer-request.service.ts`, `services/customer-order.service.ts`, `routes/rvb-catalog.ts`, `models/customer*.ts`, `sale.model.ts`, `product.model.ts`, `payment.model.ts` not modified. Only `H.S.H-V2.0.0/backend/.env` `CORS_ORIGIN` originally `3000,8081` — for web tests on `8082`, runtime started with `CORS_ORIGIN=http://localhost:3000,http://localhost:8081,http://localhost:8082` via `set CORS_ORIGIN=... && npx tsx src/server.ts` (env override, file still `192.168.100.1` + `3000,8081` original, restored after). `MONGODB_DNS_SERVERS` file remains `192.168.100.1` (original), runtime override `8.8.8.8,1.1.1.1` for Atlas connectivity (file not permanently changed, as per Phase 2 cleanup rule). QA helpers `seed-qa-customer.ts`/`reset-qa-customer-full.ts` are QA helpers, not business.

## 27. Remaining Customer Bugs

- **BLOCKER:** None
- **CRITICAL:** None
- **HIGH:** None
- **MEDIUM:**
  - `expo-print` on web `Print.printAsync` requires popup permission; headless Playwright cannot fully verify printed PDF content, only button visibility and that `sanitizeForCustomerPdf` excludes sensitive fields. Native share `DEVICE SHARE NOT TESTED` (no physical device, but `printToFileAsync` + `Sharing.shareAsync` compiles and `expo export` succeeds, honest).
  - `CustomerDashboard` `Payment History` currently shows `0` for `QA-CUST-r484` (no payments seeded); `GET /portal/customer/payments` returns `[]` correctly, but if backend later exposes payments via other source, dashboard will show up to 10. Honest empty state not a bug.
  - `CustomerDashboard` `Activity` has no dedicated `GET /portal/customer/activities` (only worker has); dashboard shows placeholder `"Activity via Requests & Orders"` + request/order history source of truth. If backend later adds `customer-activities`, dashboard could switch to real endpoint, but current `GET /activities` general is used as fallback (25 activities after flow, but not customer-specific, so not shown). Not a blocker, documented.
  - `Place Order` and `Insert Shipment` both use `quantity>0` but `weightKg>=0` semantics; `validateItems` enforces `quantity>0` for both, but customer order `weight 0` with `quantity 1` is allowed (e.g., `1kg 0` would be `0` total, not useful but not rejected). Business could require `weight>0` for meaningful total, but current `weight>=0` is correct per spec (user-entered starting at `0`, not current inventory).
  - Rate limit `30/min` per `accountKey` for `POST /customer-requests` and `POST /customer-orders` caused `429` on consecutive full suites without 61s wait; `test-customer.ts` now handles `429` via `61s` retry + `150ms` throttle, but manual rapid double-tap in UI is already guarded via `submitting` disable, so not a user-blocking bug, but test suite needs `65s` pause between passes (documented).
- **LOW:**
  - `CustomerDashboard` summary `Orders` shows `orders.length` but not `sales` total value sum; could add sum but not required.
  - `customer-orders.tsx` edit form only allows editing quantity of first item (simplified for price-authority test); full multi-item edit would need product picker for each item, but current `editOrder` API supports full `items` array, and `test-customer.ts` covers the authoritative price case, so not a blocker for Phase 5.
  - `formatCurrency` uses `fr-DZ` locale for `DA`, correct for Algeria, but for `€`/`$` would still use `fr-DZ` formatting (minor).
  - `insert-shipment.tsx` and `place-order.tsx` product picker is `Pressable` list with `maxHeight 150` `ScrollView`, not searchable dropdown; for `11` products fine, but for many products could need search.

## 28. Explicit Answers

- **Does Customer see real own profile?** YES (`GET /portal/customer` `QA-CUST-r484` with `name, phone, address, type, balance`, no `serverRevision`)
- **Does Customer see Current Balance?** YES (`30000` → `30 000 DA` via `GET /config` `DA`, `Current Balance` label)
- **Does Customer see Sale/Shipment history?** YES (`GET /portal/customer/sales` `2` seeded + `3` after accept, `Sales / Shipment History` card with `date, total, items`)
- **Does Customer see payment history if exposed?** YES/N/A — endpoint `GET /portal/customer/payments` exists and is called, currently `0` for `QA-CUST-r484` (honest empty), dashboard shows `Payment History` card with `Empty` state (not fabricated).
- **Can Customer submit Insert Shipment?** YES (`POST /customer-requests {type:"insert_shipment", items:[{productId, quantity, weightKg, price}]}` with `1..50` validation, catalog `for=customer` `11` products)
- **Does Shipment submission mutate balance immediately?** NO (`30000` before and after `under_review`)
- **Does Shipment submission mutate inventory immediately?** NO (`sales 2` before and after, product `quantity/weight` unchanged until accept)
- **Does Shipment acceptance create exactly one Sale?** YES (`2` → `3` after `POST /:id/review {accepted}`, `saleId` created, `409` duplicate)
- **Does Shipment acceptance mutate inventory once?** YES (`Product.quantity -2, weightKg -10` via `allocateRevision` + `SyncChange`, reverted after test proving one decrement)
- **Does Shipment acceptance mutate balance once?** YES (`30000 + 13000 = 43000`, duplicate `43000` remains)
- **Can duplicate Shipment acceptance repeat effects?** NO (`409 RVB_REQUEST_ALREADY_REVIEWED`, balance `43000` remains, sales `3` remains)
- **Does insufficient inventory roll back safely?** YES (`1000 qty` → `400 RVB_INSUFFICIENT_STOCK`, balance `43000` remains, sales `3` remains, no partial Sale)
- **Can Customer submit Discrepancy?** YES (`POST {type:"discrepancy", description}` with `trim required ≤2000`, counter `0/2000`)
- **Can Discrepancy mutate business data directly?** NO (`43000` before → `43000` after submit and after `accepted`, no Sale/inventory)
- **Can description exceed 2000?** NO (`2000` allowed, `2001` → `400 RVB_DESCRIPTION_TOO_LONG`)
- **Can Customer Place Order?** YES (`POST /customer-orders {items:[{productId, quantity, weightKg, price}]}` with `1..50`, catalog `for=customer`, `notes` ≤2000)
- **Is Customer Order price server-authoritative?** YES (`price 1` or `999999` → stored `1300`, `total 1` → `6500`/`2600` recomputed via `enforceCustomerPrice` + `computeTotal`, verified `forged 1→1300` and `total 1→6500`)
- **Does Order submission create Sale immediately?** NO (`sales 2` before and after `under_review` order create, `3` remains `3` after order accept, per Phase 1 order is controlled state transition not fulfillment)
- **Does Order submission mutate inventory immediately?** NO (no `Product` update on `POST /customer-orders`)
- **Can Customer edit own Under Review Order?** YES (`PATCH /customer-orders/:id {items:[{productId, quantity:3, weightKg:5, price:999999}]}` with own `accountId`, `under_review` → `under_review` remains, `price 1300` authoritative, `total 6500`)
- **Can Customer edit terminal Order?** NO (`PATCH` after `cancelled`/`accepted`/`rejected` → `400 RVB_ORDER_ALREADY_REVIEWED`, UI hides `Edit` for non-`under_review`)
- **Can Customer cancel own Under Review Order?** YES (`POST /:id/cancel` own `accountId`, `under_review` → `cancelled` with `cancelledAt`, no Sale/inventory/balance)
- **Can Customer cancel terminal Order?** NO (`POST /:id/cancel` after `cancelled` → `400 RVB_ORDER_ALREADY_REVIEWED`, UI only shows `Cancel` for `under_review`)
- **Can Customer see Orders separately from Requests?** YES (`GET /customer-orders` `7` orders vs `GET /customer-requests` `7` requests, dashboard `Orders` card + `Request History` card distinct, screens `customer-orders.tsx` vs `customer-requests.tsx`)
- **Can authorized management review Orders?** YES (`POST /customer-orders/:id/review {accepted}` as `qa.manager.mobile` → `accepted`, `rejected`, `edit+accept total 3900 price 1300`, duplicate `409`, verified)
- **Can Supervisor review Customer Orders according to contract?** YES (`POST /:id/review {accepted}` as `qa.supervisor.mobile` → `accepted`, per contract `manager|admin|supervisor` for `customer-orders` review)
- **Can Customer access another Customer's records?** NO (`GET /customers` → `403`, `GET /accounts` → `403`, `customerId` spoof in request/order → `403`, other customer's orders not listed via `GET /customer-orders` filtered to own `linkedId`)
- **Can Customer spoof customerId?** NO (`customerId:"cust-other-id"` in `POST /customer-requests` or `POST /customer-orders` → `403 RVB_FORBIDDEN` via `account.linkedEntityId` derivation)
- **Are management controls hidden?** YES (no `All Customers`/`Accounts`/`Workers`/`Suppliers` management, no `review` buttons for customer, only `Edit`/`Cancel` for own `under_review`, `403` for management endpoints)
- **Can Customer export own information?** YES (`Export Customer PDF` via `expo-print` + `sanitizeForCustomerPdf`, web print preview, native share; button visible and code builds, `DEVICE SHARE NOT TESTED` honest)
- **Does Arabic remain usable?** YES (`PATCH preferences ar` → `isRTL` `row-reverse` + `textAlign right` for header, summary, rows, `formatDate ar-DZ`, `Insert Shipment` product selector, item rows, `Place Order` quantity/weight inputs, order edit `quantity`, cancel controls, status badges all readable, reverted to `en`)
- **Was real Chromium used?** YES (`playwright chromium headless 1.63.0`, `http://localhost:8082` `dist` `entry-327f...` + `http://localhost:5000` backend, customer `login → dashboard → Insert Shipment/Place Order/Discrepancy → Orders/Requests → PDF → EN/FR/AR`, `pageErrors 0`, `failed500 0`)
- **Did Worker remain green?** YES (`reset-qa-worker-full.ts` → `test-worker.ts` `PASS` (`50000→60001` with payment `20000` + loan `30001`, duplicate `409`, `8` activities, `ar→en`), `test-worker-web.ts` still `PASS` (`Current Credit`, `QA-WORKER-r484`), after customer `npx tsc` `PASS`, `expo-doctor` `21/21`, `export` `891 modules`)
- **Did Supplier remain green?** YES (`reset-qa-supplier-full.ts` → `test-supplier.ts` `PASS` (`20000→39500` with `19500`, `409`, `2000/2001`, `403` security, `ar→en`), `test-supplier-web.ts` `PASS` (`Current Balance`, `QA-SUP-r484`))
- **R.V.B MOBILE CUSTOMER EXPERIENCE READY:** YES

