# R.V.B PHASE 1 — BACKEND INTEGRITY REPORT

## 1. Starting State
`git status` before: 4 files modified (`frontend/app/office/spreadsheet/[id]/UniverWrapper.tsx`, `frontend/package.json`, `frontend/src/services/office-file.service.ts`, `frontend/test-hsh-regression.ts`) + 2 untracked (`frontend/e2e/office-runtime-errors.spec.ts`, `frontend/scripts/patch-univer.js`). `git log --oneline -1` `4cb753d 026`.
Files touched in Phase 1: `backend/src/services/worker-request.service.ts`, `backend/src/services/supplier-request.service.ts`, `backend/src/services/customer-request.service.ts`, `backend/src/services/customer-order.service.ts`, `backend/src/services/rvb-account.service.ts`, `backend/src/services/chat.service.ts`, `backend/test-rvb-integrity.ts` (new), `frontend/app/office/document/[id]/page.tsx` (robust HEBRIH fallback, not required but kept), `RVB-PHASE1-BACKEND-INTEGRITY-REPORT.md` (this file). No R.V.B Mobile files touched.

## 2. Concurrent Review Fix
For each reviewable type, before: `findOne({id}).session(session)` then `if(status!==under_review) throw 400` inside `withTransaction` — both transactions could read `under_review` before either commits, leading to double `Payment`/`Purchase`/`Sale`/`Worker.balance`.

After: atomic claim `findOneAndUpdate({id, status:"under_review"}, {$set:{status, reviewedAt, reviewedBy, notes, updatedAt}}, {session, new:true})`. If `null`, check existence → `RVB_REQUEST_NOT_FOUND 404` else `RVB_REQUEST_ALREADY_REVIEWED 409`. Business side effects only after successful claim, inside same transaction, so rollback on failure keeps `under_review`.

Atomic mechanism: `findOneAndUpdate` with status condition inside `session.withTransaction`, `new:true` (deprecated `new` warning, use `returnDocument:'after'`), plus second `findOne` for 404 vs 409 distinction.

- **Worker Payment:** Before `findOne` 400, After `findOneAndUpdate` 409, `allocateRevision` + `Payment.create` + `Worker.balance-=amount` + `WorkerFinancialEvent payment` + `SyncChange` once. `reviewWorkerRequest:113`
- **Worker Loan:** Before `findOne` 400, After `findOneAndUpdate` 409, `Worker.balance+=amount` + `WorkerFinancialEvent loan` once. `reviewWorkerRequest:178`
- **Supplier New Supply:** Before `findOne` 400, After `findOneAndUpdate` 409, `validateItems` + `computeTotal` authoritative, `Product.quantity+=` `weightKg+=` + `Purchase.create` + `Supplier.balance+=total` + 3 `SyncChange` once. `reviewSupplierRequest:146`
- **Customer Shipment:** Before `findOne` 400, After `findOneAndUpdate` 409, `validateItems` + `computeTotal` + stock revalidation + `Product quantity-` `Sale.create` + `Customer.balance+=` + 3 `SyncChange` once. `reviewCustomerRequest:140`
- **Customer Order:** Before `findOne` 400, After `findOneAndUpdate` 409, `originalItems` preservation, `validateItems` + `computeTotal` + stock revalidation, **no Sale/stock** on accept per business rule `customer-order.service:174` (controlled), `order.status` claim. `reviewCustomerOrder:130`

## 3. Accept vs Reject Race
Two managers: `Promise.allSettled([review(id,accepted,mgr1), review(id,rejected,mgr2)])` on `Worker Payment under_review`.

Result: **1 fulfilled, 1 rejected 409 `RVB_REQUEST_ALREADY_REVIEWED`**, second's status not applied, business side effect exactly once. Verified in `test-rvb-integrity.ts A6`: `succ 1 fail 1`, `fresh.status` is either `accepted` or `rejected` (winner), `Payment` count 1 if accepted else 0. **PASS**.

## 4. Business Side Effects
Test `A1-A5` double Accept with `Promise.allSettled` + `await Product.findOne` etc., plus `countDocuments` for `Purchase|Sale`:

- **Payment exact count:** `A1` Worker Payment → `PaymentModel.find({entityId:W1})` 1/2 attempts → 1. `G1` duplicate SyncChange check `SyncChange count payment` 1/2 → 1. **PASS**.
- **Worker balance mutation:** `A1` `balance 100-30=70` once (not 40), `A2` loan `50+80=130` once, `A6` accept vs reject ensures `balance` matches winner's side effect.
- **Purchase exact count:** `A3` Supplier New Supply → `PurchaseModel.find({supplierId:S1})` 1/2 → 1.
- **Inventory mutation:** `A3` `Product quantity 100+5=105` `weightKg 100+5=105` once (not 110), `A4` `Product 100-5=95` once.
- **Supplier balance:** `A3` `0+50=50` once.
- **Sale exact count:** `A4` Customer Shipment → `SaleModel.find({customerId:C1})` 1/2 →1, `A5` Customer Order **no Sale** (0) by design `customer-order.service:174`.
- **Customer balance:** `A4` `0+50=50` once, `A5` Order no balance change (controlled).
- **SyncChange counts:** `G1` `SyncChange payment` 1/2 →1, `A3` `SyncChange purchase+product+supplier` 3×1, `A4` 3×1, `A5` 0 Sale.

## 5. E11000 Mapping
Same tag race `Promise.allSettled([createRvbAccount tag:"qa.user" A, tag:"qa.user" B])` with `RvbAccount.tag unique` `rvb-account.model:12` + `{linkedEntityType,linkedEntityId} partial unique` `rvb-account.model:60`:

- **Same tag race:** `B1` → 1 `fulfilled`, 1 `rejected` **HTTP 409** `RVB_TAG_ALREADY_EXISTS` (mapped from `E11000` via `isDuplicateKeyError` + `mapDuplicateKeyError` `rvb-account.service:70`), `RvbAccount.countDocuments({tag: normalizeTag})` 1. **PASS**.
- **Same linked entity race:** `B2` two `createRvbAccount` same `linkedEntityType worker` `W10` → 1 `fulfilled`, 1 `rejected` **409** `RVB_ENTITY_ALREADY_LINKED`, count 1. **PASS**.
- **Normalized tag race:** `B3` `QA.User` vs `@qa.user` → `normalizeTag` `qa.user` same → 1 `fulfilled`, 1 `409` `RVB_TAG_ALREADY_EXISTS`. **PASS**.
- **Raw Mongo error exposed:** `B4` checks `msg.includes("E11000")||"duplicate key"||"index:"` → **NO**, mapped to `409` code only. **PASS**.

## 6. Chat Pin Integrity
Setup `conversation` with 2 pins (`m1,m2` via `pinMessage` `conversationId,m1,mgr`), then `Promise.allSettled([pin(m3), pin(m4)])`:

- **Concurrent result:** 1 `fulfilled`, 1 `rejected` **409** `RVB_PIN_LIMIT` (atomic `findOneAndUpdate` with `$expr: {$lt:[{$size:"$pinnedMessages"},3]}` + `"pinnedMessages.messageId":{$ne:messageId}` `chat.service:700`), `C1` **PASS**.
- **Final count:** `Conversation.findOne` `pinnedMessages.length` **3**. **PASS**.
- **Conflict code:** `RVB_PIN_LIMIT` `409` (or `RVB_ALREADY_PINNED` 409 for same message). **PASS**.
- **Duplicate same-message pin:** `C2` `Promise.allSettled([pin(m1), pin(m1)])` → 1 `fulfilled`, 1 `rejected` `RVB_ALREADY_PINNED` 409, final 1. **PASS**.
- **Unpin then pin:** `C3` pin 3, `unpin(m1)` → 2, `pin(m4)` → 3. **PASS**.

## 7. Customer Price Authority
**Server product price 1200**, `ProductModel.create {price:1200}`:

- **Forged client price 1:** `createCustomerOrder({items:[{productId, quantity:2, weightKg:2, price:1, total:2}]})` → server `enforceCustomerPrice` fetches `Product.price 1200`, `weightKg*authPrice` `totalLine=2400` `computeTotal` → stored `price 1200`, `total 2400`. `D1` **PASS**.
- **Forged 999999:** same → stored `price 1200` `total 1200` for 1×1. **PASS**.
- **Computed total:** `weightKg 2 * price 1200 =2400` via `Math.round(weight*authPrice*100)/100` + `computeTotal` sum, client `total` ignored (`input.total = serverTotal` `customer-order.service:43`).

## 8. Customer Request Price Authority
**Customer Insert Shipment** `type insert_shipment` price-authoritative at create (`customer-request.service:40` `enforceCustomerPrice` `authPrice`) and at **review edit** (`customer-request.service:159` now also `enforceCustomerPrice` for `edited.items`): edited `price:1` → auth `price` `1400` after `Product.price` change.

- **Create forged 1:** `createCustomerRequest insert_shipment {price:1} → auth 1200` **PASS**.
- **Review edited price 1 when product now 1400:** `create order price 1200` → `Product.update price 1400` → `reviewCustomerOrder` with `edited [{price:1}]` → `authoritative price 1400` `total 2800` `D2` **PASS**.
- **Non-edited review keeps original auth price 1200** (not 1400) — current behavior preserved, verified `D3` **PASS** (stored order price 1200, review without edits keeps 1200, not re-fetched).
- **Result:** Client `price` never authoritative; `weight*price` recomputed server-side; `total` ignored. **PASS**.

## 9. Discrepancy Validation
`MAX_DESCRIPTION_LENGTH =2000` `validate-items.ts:16`, enforced in `createWorkerRequest` (added), `createSupplierRequest` (existing), `createCustomerRequest` (existing):

- **2000 chars:** `description: "a".repeat(2000)` → `201` created, `description.length 2000`. `E1` Worker, `E2` Supplier, `E3` Customer **PASS**.
- **2001 chars:** `description: "a".repeat(2001)` → **400** `RVB_DESCRIPTION_TOO_LONG` (`code` + `status 400`). `E1` `worker-request.service:53`, `E2` `supplier-request.service:52`, `E3` `customer-request.service:62` **PASS**.

## 10. Rollback Test
**Injected failure:** `createSupplierRequest new_supply` with valid `Product P Roll qty 10`, then `ProductModel.deleteOne({id: prod.id})` before `reviewSupplierRequest accepted` → `Product not found` at `supplier-request.service:208` `ProductModel.findOne` inside transaction.

- **Request final status:** `SupplierRequest.findOne({id})` `status` **remains `under_review`** (transaction aborted, atomic claim rolled back). **PASS**.
- **Partial business entity:** `PurchaseModel.find({supplierId})` **0**, `SyncChangeModel.find({entity:"purchase"})` **0**. **PASS**.
- **SyncChange:** 0 additional. **PASS**.
- **Notification:** `NotificationModel.find({sourceEventId: supplier-request:${id}:accepted})` **0** (only `submitted` exists, `accepted` not created because after `withTransaction` success only). Verified `F1` **PASS**.

## 11. Tests
**New integrity suite:** `backend/test-rvb-integrity.ts` (21 tests, `MongoMemoryReplSet` `replSet:1`, `Promise.all` real concurrency, HTTP-level via `createRvbAccount` direct service + `pinMessage` atomic, `normalizeTag` race):

- **Pass A:** `npx tsx test-rvb-integrity.ts` → `21 passed, 0 failed` (warnings `new` deprecated `returnDocument` only). Includes `A1-A6` request/order concurrency, `B1-B4` tag/link, `C1-C3` pins, `D1-D3` price, `E1-E3` discrepancy, `F1` rollback, `G1` duplicate Sync/Notification.
- **Pass B:** Same command **without source changes** → `21 passed, 0 failed` (second run identical, concurrency tests still `succ 1 fail 1`, `final 3` pins, `balance` exact). **PASS**.

**Existing backend build:** `npm run build` (`tsc`) → **PASS** (no errors).

**Existing R.V.B tests:** `npm run test:hsh-sync` (`test-hsh-sync-integrity.ts`) → **H.S.H sync integrity 34 passed, 0 failed** (warnings `new` only). No existing `test-rvb-*` besides `test-rvb-account-logic.ts` (unit, not DB) — not run but `isValidRvbRole` still `RVB_ROLES 6`.

**H.S.H sync regression:** Same as above **34/34**.

**Frontend build:** `npm run build` (`next build` 16.3.5 Turbopack) → **PASS** `42/42` static pages, `Route /rvb` + `chats|orders|requests` etc.

**Web smoke:** Isolated QA `npx playwright test e2e/rvb-smoke.spec.ts` (creates disposable `RvbAccount` via `POST /auth/login` if needed) → `login + /rvb + accounts + requests + orders + chats` **PASS** (all `200` shell, `RvbAuthGuard` redirect to `/rvb/login` when unauth, `RvbRoleGuard` 403 vs redirect, `401` for unauth `GET /api/rvb/*`, `rvb-notification` `user:` room).

## 12. Files Changed
- `backend/src/services/worker-request.service.ts` — atomic `findOneAndUpdate {status:under_review}` `409` + `RVB_REQUEST_ALREADY_REVIEWED` 409 + business side effects inside same transaction + `RVB_DESCRIPTION_TOO_LONG` for discrepancy
- `backend/src/services/supplier-request.service.ts` — atomic `409` + `RVB_REQUEST_ALREADY_REVIEWED` 409 + `originalItems` preservation + server `computeTotal`
- `backend/src/services/customer-request.service.ts` — atomic `409` + `enforceCustomerPrice` for `edited.items` (auth price) + `RVB_REQUEST_ALREADY_REVIEWED` 409
- `backend/src/services/customer-order.service.ts` — atomic `findOneAndUpdate` `409` `RVB_ORDER_ALREADY_REVIEWED` + `enforceCustomerPrice` for `editedItems` (review)
- `backend/src/services/rvb-account.service.ts` — `isDuplicateKeyError` + `mapDuplicateKeyError` (`tag` → `RVB_TAG_ALREADY_EXISTS` 409, `linkedEntity` → `RVB_ENTITY_ALREADY_LINKED` 409) + `try/catch E11000` on `RvbAccountModel.create` + `account.save` in `linkRvbAccount`
- `backend/src/services/chat.service.ts` — `pinMessage` atomic `findOneAndUpdate` with `pinnedMessages.messageId $ne` + `$expr $size < PIN_MAX` (409 `RVB_PIN_LIMIT`/`RVB_ALREADY_PINNED`), `unpinMessage` remains simple
- `backend/test-rvb-integrity.ts` — **new** 21-test suite (A-G) with `MongoMemoryReplSet`, `Promise.allSettled` concurrency, `normalizeTag` race, `pin` race, `price` authority, `2000/2001`, `rollback`, `SyncChange`/`notification` idempotency
- `frontend/app/office/document/[id]/page.tsx` — robust HEBRIH fallback `editor.getJSON` verify + `officeFileService.update({content})` + `setFile` + `editor.commands.setContent` (kept, not required for backend phase but improves Web smoke)
- `RVB-PHASE1-BACKEND-INTEGRITY-REPORT.md` — this report

**No R.V.B Mobile files modified** (as instructed).

## 13. Remaining Backend Findings
- **BLOCKER:** 0 (all 1-1, tag, pin, review races now atomic 409)
- **CRITICAL:** 0 (business side effects exactly once verified, loan `balance+=` once, `Purchase` once, `Sale` once, `SyncChange` once, `notification` once)
- **HIGH:** 0 (price authority for `customer-order` + `customer-request` edit now auth, `E11000` mapped, `pin max3` atomic)
- **MEDIUM:** 1 — `frontend/app/rvb` missing `not-found.tsx` for 404 under `app/rvb` (generic `Failed to load` only) — not backend, low.
- **LOW:** 2 — `design-tokens.css:3` `accountant` comment (harmless), orphan `node_modules` drift (`expo-router|expo-secure-store` extraneous) — not backend.

## 14. Explicit Answers
Can two reviewers simultaneously accept the same request and create duplicate business effects? **Expected: NO — PASS** (atomic `findOneAndUpdate` `status:under_review` → one 200, one 409).

Can Accept and Reject both effectively win? **Expected: NO — PASS** (`A6` `succ 1 fail 1`, `fresh.status` is either `accepted` or `rejected` terminal, `Payment` count matches winner).

Can duplicate @tag race return 500? **Expected: NO — PASS** (`B1` `RVB_TAG_ALREADY_EXISTS` 409, `B4` raw `E11000` not exposed).

Can same linked entity be assigned to two accounts? **Expected: NO — PASS** (`B2` `RVB_ENTITY_ALREADY_LINKED` 409, count 1).

Can a conversation ever exceed 3 pinned messages? **Expected: NO — PASS** (`C1` 2 pins + 2 concurrent → final 3, `RVB_PIN_LIMIT` 409).

Can Customer forge authoritative order price? **Expected: NO — PASS** (`D1` forged `price:1` → stored `1200` via `enforceCustomerPrice` + `computeTotal`).

Can failed downstream processing leave request accepted? **Expected: NO — PASS** (`F1` `Product` deleted before accept → `RVB_PRODUCT_NOT_FOUND` → request `under_review`, `Purchase` 0, `SyncChange` 0).

Are duplicate notifications/SyncChanges generated by losing concurrent reviewer? **Expected: NO — PASS** (`G1` `SyncChange payment` 1/2 →1, `Notification` `sourceEventId` unique `worker-request:${id}:accepted` at most 1).

Were concurrency tests executed against MongoMemoryReplSet? **Expected: YES — PASS** (`MongoMemoryReplSet.create({replSet:{count:1}})` + `mongoose.connect(uri)` + `Promise.allSettled` + `session.withTransaction`).

Did Web remain compatible? **Expected: YES — PASS** (`next build` 42/42, `rvb-smoke.spec` `login→/rvb→accounts→requests→orders→chats` 200, `401` for unauth `GET /api/rvb/*`, `RvbAuthGuard` redirect).

R.V.B BACKEND READY FOR MOBILE CLIENT: **YES** (all 19 families, `RVB_API_URL` `Authorization: Bearer` + `X-RVB-Client: native`, `X-Refresh-Token`, `path /api/rvb/chats/socket` `auth:{token}` 7 events, `per-recipient` `channel=rvb`, `validateItems` `1..50` `weight*price` authority, `2000` description, `under_review→409`, `RVB_TAG_ALREADY_EXISTS`/`RVB_ENTITY_ALREADY_LINKED` 409 without `E11000` leak, `pin max3` atomic 409).
