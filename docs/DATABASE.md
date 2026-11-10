# Database

MongoDB (backend, via Mongoose 9) is the system of record; Dexie (IndexedDB) on the
frontend mirrors the 20 sync entities plus sync bookkeeping. Only relationships
listed here are enforced or used in source.

## HSH sync entities (20)

Backend registry: `backend/src/sync/model-registry.ts`. Frontend mirror:
`frontend/src/services/sync/tables.ts` (`SYNC_ENTITIES`) and Dexie
`frontend/src/lib/database/db.ts` (database `HebrihSlaughterHouse`, schema v10).

| Entity | Frontend table | Represents |
|---|---|---|
| `product` | `products` | Sellable/purchasable product (price authoritative for customer lines) |
| `supplier` | `suppliers` | Supplier with balance |
| `customer` | `customers` | Customer with balance and type |
| `bankAccount` | `bankAccounts` | Cash/bank account with balance |
| `vehicle` | `vehicles` | Vehicle record |
| `worker` | `workers` | Worker with salary/balance |
| `expense` | `expenses` | Expense record |
| `task` | `tasks` | Task / finished-task record |
| `purchase` | `purchases` | Purchase with line items (supplier-linked) |
| `sale` | `sales` | Sale with line items (customer-linked) |
| `payment` | `payments` | Payment against an entity (`entityType` + `entityId`) |
| `transfer` | `transfers` | Account-to-account transfer |
| `injuryEquation` | `injuryEquations` | Injury/equation record |
| `settings` | `settings` | Company settings (incl. currency) |
| `notification` | `notifications` | In-app notification (`channel=hsh` only over HSH sync) |
| `invoice` | `invoices` | Issued invoice (draft / issued / cancelled) |
| `invoiceSellerProfile` | `invoiceSellerProfiles` | Seller profile + sequence counter |
| `invoiceTaxProfile` | `invoiceTaxProfiles` | Tax profile for line computation |
| `incomingInvoice` | `incomingInvoices` | Supplier incoming invoice |
| `officeFile` | `officeFiles` | Office document / spreadsheet file |

Every entity uses a client-generated string `id` (not Mongo `_id`) as its identity;
sync keyset paging, idempotency, and Dexie keys all use `id`. Server responses strip
`_id`/`__v`.

## Relationships and ownership rules

- `sale.customerId → customer.id`, `purchase.supplierId → supplier.id`.
- `payment` carries `entityType` + `entityId` pointing at a customer, supplier,
  worker, or bank account; indexed as `payments: id, entityType, entityId, accountId, date…`.
- `transfer` moves value between two `bankAccount` records.
- `invoice` links `sellerProfileId → invoiceSellerProfile.id` and optionally a
  source sale; issuing the same sale twice is rejected (`409
  SOURCE_SALE_ALREADY_INVOICED`). `invoiceTaxProfile` drives per-line tax
  computation (`computeLineFromTaxRate`).
- `worker` ↔ `RvbAccount` via `linkedEntityId` (same pattern for supplier/customer
  accounts). Portal endpoints derive the entity from `req.rvbUser` — client-supplied
  ids are never trusted.
- Financial guards run inside Mongo transactions on the server: sales/purchases
  validate items (`≤ 500` lines, integer `quantity > 0`, `total = round(weight ×
  price)` ± 0.005, supplier/customer/date required) and enforce
  `INSUFFICIENT_STOCK / BANK / SUPPLIER / CUSTOMER / WORKER_BALANCE`.
- RVB request acceptances materialize as real `Sale`/`Purchase` rows through the
  same transactional handlers (single code path, not a parallel implementation).

## Sync metadata collections

| Collection | Purpose |
|---|---|
| `sync-counters` (`SyncCounter`, `key: "global"`) | Atomic monotonically increasing global revision (`getNextRevision`) |
| `sync-changes` (`SyncChange`) | One row per mutation: `{ entity, entityId, operation, payload, revision }`. Grows without bound — no deletion job exists; `resyncRequired` guard covers future retention |
| `processed-sync-operations` (`ProcessedSyncOperation`) | Idempotency record per `operationId`: terminal vs. retryable outcomes for replay diagnostics |

Frontend Dexie bookkeeping: `syncOperations` (outbox: `operationId, entity,
entityId, operation, createdAt, synced, clientId, status`), `syncMeta` (`clientId`,
`serverRevision`, `lastSuccessfulSyncAt`, `syncLease`, `snapshotMigration`
progress), `syncConflicts` (conflict outcomes).

## RVB / auth / chat collections

`rvb-account` (tag unique `/^[a-z0-9][a-z0-9._]{2,29}$/`, normalized lowercase,
`@` stripped; `passwordHash`, `refreshTokenHash` never leave the server),
`rvb-session` (refresh-token hash, `revokedAt`, `expiresAt`, `rotationFamilyId`,
`clientType`), `rvb-activity`, `rvb-notification-recipient` (per-user read/archive
state), `rvb-chat-reminder`, `conversation`, `message`, `message-audit` (manager-only
reads), `chat-upload`, `customer-order` (partial unique index on
`(accountId, clientRequestId)` — boot is fatal without it), `customer-request`,
`supplier-request`, `worker-{model, request, financial-event, activity}`.

## Indexes

- Portal compounds (boot best-effort via `ensurePortalListIndexes`,
  `backend/src/models/portal-list-indexes.ts`): `sales{customerId, date, createdAt}`,
  `purchases{supplierId, date, createdAt}`, `payments{entityType, entityId, date,
  createdAt}`. At 100 k-sale scale the indexed plan is ~77× faster than COLLSCAN+SORT
  (see `docs/TESTING.md`); verify with `db.sales.getIndexes()` after deploy.
- `customer_orders`: partial unique `(accountId, clientRequestId)` for order
  idempotency (fatal boot check).
- Chat: conversation indexes (`ensureConversationIndexes`); RVB notifications:
  `channel + sourceEventId` unique sparse (HSH/RVB channel separation).
- Dexie v10 indexes per table (e.g. `invoices: id, sellerProfileId, invoiceNumber,
  status…`, `notifications: id, type, severity, createdAt, readAt, archivedAt,
  priority…`).

## Integrity rules

- HSH bootstrap/snapshot expose notifications with `channel = "hsh"` only; `rvb`
  notifications never flow over HSH sync.
- Tombstones are `SyncChange` rows with `operation: "delete"` and must be retained
  at least as long as regular changes.
- `settings` changes from `PATCH /api/rvb/config` (manager-only) are recorded as
  `SyncChange` rows so HSH clients converge on company currency.
- RVB mutations to workers/suppliers/customers record `SyncChange` rows for the
  same HSH incremental pull.
- Test-database guard (`lib/test-db-guard.ts`) refuses to run harnesses against the
  production database/cluster; there is no override.
