# API

Base URL is `NEXT_PUBLIC_API_URL` (web) / `RVB_API_URL` (mobile), e.g.
`http://localhost:5000` in development. All endpoints below are mounted by
`backend/src/server.ts`. The frozen web/mobile contract
(`H.S.H-V2.0.0/RVB-MOBILE-CONTRACT.md`) additionally pins auth transports, DTO
rules, and guard order — consult it for mobile work; this document describes the
server as implemented.

## Conventions

- Success shape: `{ success: true, ... }`. Errors: `{ success: false, code,
  message }` with an HTTP status (`err.status`, else 500). There is no global
  error middleware; invoice 500 paths return generic `INTERNAL_ERROR` while 409
  duplicate branches are preserved.
- Every `/api/*` response carries `X-Request-Id` (incoming value honored, else
  `req-<uuid>`); sync error logs include it for correlation.
- Bodies are capped at 1 MB (`express.json/urlencoded`). Dates cross the wire as
  epoch-ms numbers; money is server-recomputed, never trusted from the client.
- Pagination is **opt-in** (`backend/src/lib/pagination.ts`): no `page`/`limit`
  params → exact legacy unbounded query and shape; with params → DB-level
  skip/limit plus `{ total, page, limit, totalPages, hasMore }`. Default limit 50,
  per-endpoint max (≤ 200, absolute cap 500). Sync `/changes` uses its own
  `after`/`limit` cursor (limit ≤ 500, default 200), not `page`.

## Authentication (RVB only)

JWT access token (default TTL 15 m) + rotating refresh token (default 30 d, sha256
hash stored in `rvb-session`). Three access transports, in order: `Authorization:
Bearer`, `rvb_access_token` cookie, `X-RVB-Token`. Web refresh uses the `HttpOnly`
`rvb_refresh_token` cookie; native clients pass `{ refreshToken }` or
`X-Refresh-Token` with header `X-RVB-Client: native` and receive the rotated
refresh in JSON.

| Endpoint | Description |
|---|---|
| `POST /api/rvb/auth/login` | `{ tag, password, native? }` → `{ accessToken, account, mustChangePassword }` (+ cookie or `refreshToken`) |
| `POST /api/rvb/auth/refresh` | Rotates session within the same `rotationFamilyId`; old refresh invalidated, session room disconnected |
| `POST /api/rvb/auth/logout` | Revokes via cookie or Bearer session; clears cookie; always 200 |
| `GET /api/rvb/auth/me` | Current account incl. `onboardingStatus`, `mustChangePassword`, `profilePicture` |
| `PATCH /api/rvb/auth/profile` | Self `displayName` (≤ 80), `profilePicture` data URL (< 250 kB) |
| `GET/PATCH /api/rvb/auth/preferences` | `{ notifications: { chats, mentions, requests, orders, statusUpdates, reminders }, ui: { language: en\|fr\|ar, theme: light\|dark } }`; groups patch independently |
| `POST /api/rvb/auth/onboarding` | `{ profilePicture }` → `onboardingStatus = complete` |
| `POST /api/rvb/auth/change-password` | `{ currentPassword, newPassword, confirmPassword }` (≥ 8 chars); revokes other sessions, rotates current |

Terminal auth codes (client must re-login, not retry): `RVB_TOKEN_INVALID`,
`RVB_TOKEN_EXPIRED`, `RVB_SESSION_REVOKED`, `RVB_REFRESH_REQUIRED`,
`RVB_UNAUTHENTICATED`, `RVB_ACCOUNT_ARCHIVED`, `RVB_ACCOUNT_DISABLED`,
`RVB_ACCOUNT_NOT_FOUND`.

## Authorization

Roles (`backend/src/constants/rvb-roles.ts`): `manager`, `supervisor`, `worker`,
`supplier`, `customer`. `admin` is retired (migrated to `manager` in place) and
rejected for new accounts. Management = `manager, supervisor`; portal = `worker,
supplier, customer`.

| Scope | Rule (verified in source) |
|---|---|
| `/api/rvb/accounts` | `manager` only |
| `PATCH /api/rvb/config` | `manager` only (`GET` readable by all authenticated) |
| `/api/rvb/workers`, `/suppliers`, `/customers` lists | `manager, supervisor` |
| `POST …/worker-requests/:id/review`, `supplier-requests/:id/review`, `customer-requests/:id/review`, `customer-orders/:id/review`, `bonus-absence` | `manager, supervisor` |
| Chat message edit | owner, < 15 min; delete is soft; audit reads manager-only |
| Everything else portal | ownership derived from `RvbAccount.linkedEntityId`; violations → `403 RVB_FORBIDDEN` |

Rate limits: pre-auth `POST /api/rvb/auth/login` 20/min and `/refresh` 60/min per
IP (`QA_ISOLATED=true` raises these — never set in production). Fourteen RVB
routers carry a 600/min per-account backstop applied **after** `requireRvbAuth`;
chat send is 20/10 s and attachments 20/10 min per account. Exceeding returns
`429 RATE_LIMITED` / `RVB_RATE_LIMIT`. The limiter is in-memory (see
`docs/SECURITY.md`).

## HSH endpoints (single-tenant, unauthenticated by design)

Disabled with `404 NOT_FOUND` under `SERVER_MODE=rvb-public`; production `full`
mode requires explicit `ALLOW_FULL_SERVER_IN_PRODUCTION=true`.

| Endpoint | Description |
|---|---|
| `POST /api/sync` | Push op batch (validates `entity/entityId/operation/createdAt/operationId` + registry membership; `create\|update\|delete\|upsert`); returns per-op results + `currentRevision` |
| `GET /api/sync/changes?after=&limit=` | Incremental changes after a revision (+ `nextRevision`, `hasMore`, `currentRevision`, `resyncRequired`) |
| `GET /api/sync/bootstrap` | Full snapshot of all 20 entities (`channel=hsh` notifications only) + `currentRevision` |
| `GET /api/sync/snapshot?entity=&cursor=&limit=` | Chunked per-entity keyset paging over unique `id` (see `docs/SYNCHRONIZATION.md`) |
| `GET /api/sync/status` | `{ currentRevision }` |
| `POST /api/invoices/issue` | Atomic invoice issue (seller sequence, tax computation, `409 SOURCE_SALE_ALREADY_INVOICED` on duplicate) |
| `POST /api/invoices/cancel` | Cancel an issued invoice |
| `POST /api/invoices/incoming` / `DELETE /api/invoices/incoming/:id` | Supplier incoming invoices |
| `GET /api/printing/printers` | Available printers (Windows only, else 501) |
| `POST /api/printing/print` | Print a report (allowlisted paper/margin/category/mode, `YYYY-MM-DD` dates) |
| `POST /api/printing/invoice` | Print an invoice |
| `POST /api/printing/pdf` / `POST /api/printing/invoice/pdf` | PDF generation via `puppeteer-core` |

## RVB endpoints

| Group | Endpoints |
|---|---|
| Accounts (manager) | `GET/PATCH /api/rvb/accounts`, `GET /api/rvb/accounts/linkable?type=&search=`, `GET /api/rvb/accounts/:id` (returns `linkedEntityDisplayName`) |
| Portal (self) | `GET /api/rvb/portal/me`, `/portal/worker`, `/portal/worker/financial`, `/portal/worker/activities`, `/portal/supplier[/purchases\|/payments]`, `/portal/customer[/sales\|/payments\|/orders]` — projections only, never full unfiltered reads |
| Management | `GET/POST/PATCH /api/rvb/workers` (+ `:id/archive\|reactivate`, `:id/financial-events\|activities`, `:id/bonus-absence`), `GET/POST/PATCH/DELETE /api/rvb/suppliers[/:id/purchases\|/payments]`, `GET/POST/PATCH/DELETE /api/rvb/customers[/:id/sales\|/payments\|/orders]` (delete guards: existing history / non-zero balance) |
| Worker requests | `GET/POST /api/rvb/worker-requests`, `POST /:id/review` — `payment` (amount ≤ balance), `loan` (amount > balance, revalidated at review), `discrepancy` (no direct mutation) |
| Supplier requests | `GET/POST /api/rvb/supplier-requests`, `POST /:id/review` — `new_supply` stays `under_review` (no inventory change until accepted as a `Purchase`), `discrepancy` |
| Customer requests/orders | `GET/POST /api/rvb/customer-requests`, `POST /:id/review` (`insert_shipment` → `Sale` on accept); `GET/POST /api/rvb/customer-orders`, `PATCH /:id` (edit only `under_review`), `POST /:id/cancel`, `POST /:id/review`. Items 1–50, `quantity > 0`, `weightKg ≥ 0`, `price ≥ 0`, `total = round(weight × price)` server-computed; **customer price is server-authoritative** (forged prices overwritten from `Product.price`); supplier price is a proposal |
| Aggregated | `GET /api/rvb/requests` (cross-source merge with bounded windows + server-side counts) |
| Catalog | `GET /api/rvb/catalog/products?for=customer\|supplier` → safe DTO `{ id, name, price, description, available }` only (no stock/tax internals); `for` mismatch → `403` |
| Directory | `GET /api/rvb/directory?search=&role=&limit=` (identities only, no financial fields) |
| Config | `GET /api/rvb/config` → `{ currency, customerTypes, workerPositions }`; `PATCH` manager-only (emits settings `SyncChange`) |
| Notifications | `GET /api/rvb/notifications?...&status=unread\|read\|archived\|all` (+ `/count`), `POST /:id/read`, `POST /:id/archive\|/restore`, `POST /mark-all-read`, `POST /bulk` — all scoped to the caller; `rvb` channel only |
| Activities | `GET /api/rvb/activities?...` (chat details redacted), `GET /api/rvb/worker-activities?workerId=`, `GET /api/rvb/worker-financial-events?workerId=` |
| Chat | `GET /api/rvb/chats?category=main\|secondary&search=`, `GET /:id`, `POST /dm { otherAccountId }`, `POST /group { name, memberIds }`, `POST /:id/leave`, `PATCH /:id`, `GET /:id/messages?before=&limit=&search=`, `POST /:id/messages { content, replyToMessageId?, reminderMinutes?: 30\|60\|120 }`, `PATCH /messages/:messageId`, `DELETE /messages/:messageId` (soft), `GET /messages/:messageId/audit`, `POST /messages/:messageId/reaction`, `POST /:id/pin|/unpin` (max 3), `POST /:id/read`, `GET /unread/counts`, `POST /:id/attachments` (multer memory 26 MB, 1 file), `GET /media/:uploadId` (local file or 302 to CDN) |

Workflow states: `under_review → accepted | rejected | cancelled`. Common codes:
`RVB_FORBIDDEN`, `RVB_ITEMS_TOO_MANY`, `RVB_PRODUCT_REQUIRED`,
`RVB_QUANTITY_INVALID`, `RVB_WEIGHT_INVALID`, `RVB_PRICE_INVALID`,
`RVB_DESCRIPTION_TOO_LONG`, `RVB_PRODUCT_NOT_FOUND`, `RVB_INSUFFICIENT_STOCK`,
`RVB_ORDER_NOT_UNDER_REVIEW`, `RVB_AUTH_TEMPORARILY_LOCKED` (423),
`RVB_TAG_ALREADY_EXISTS`, `RVB_ENTITY_ALREADY_LINKED`.

## Health and operations

- `GET /api/health` → `{ success:true, message }` (liveness, always 200).
- `GET /api/ready` → `{ ready:true }` (200, only with live DB) else 503
  `DB_NOT_READY`. Gate traffic on readiness.

## Socket.IO

Path `/api/rvb/chats/socket`, CORS-mirrored. Auth mirrors HTTP (token via
`handshake.auth.token` or `Authorization` header; **`?token=` query is rejected**
with `RVB_UNAUTHENTICATED`), plus live account + session checks and a 5-socket
per-account cap (oldest evicted). Rooms: `user:{id}`, `session:{id}`,
`role:{role}`, plus auto-joined conversation rooms. `chat:join` re-checks
membership; `chat:leave` only leaves joined conversation rooms; `chat:typing`
throttled to 1/s per socket with membership re-check.

Server → client events: `rvb:notification`, `chat:newMessage`,
`chat:messageEdited`, `chat:messageDeleted`, `chat:reactionUpdated`,
`chat:pinnedUpdated`, `chat:readReceipt`, `chat:typing`, `chat:unreadUpdate`.
Logout/revoke/disable triggers server-side `disconnectRvbSession` /
`disconnectRvbAccount` (except-current variant for password change).
