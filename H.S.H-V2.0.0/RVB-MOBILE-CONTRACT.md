# RVB MOBILE CONTRACT — H.S.H and R.V.B

**Version:** 2.0.0 (WEB FREEZE)
**Base URL:** `NEXT_PUBLIC_API_URL` (web) / `RVB_API_URL` (mobile) — e.g. `https://api.hebrih.example.com` or `http://localhost:5000` for dev. All endpoints prefixed `/api/rvb/*` unless noted. `SERVER_MODE=rvb-public` required for public/mobile deployment (exposes only `/api/rvb/*` and `/api/health`).

## SERVER_MODE

- `full` — local/LAN dev, mounts `/api/sync`, `/api/printing`, `/api/invoices` + R.V.B.
- `rvb-public` — mounts only `/api/rvb/*` + `/api/health`; `/api/sync|printing|invoices` → `404`. In `production` with `full`, server warns unless `ALLOW_FULL_SERVER_IN_PRODUCTION=true`.
- `TRUST_PROXY=0|1|n` controls `trust proxy` for rate limiting / IP forwarding.
- CORS via `CORS_ORIGIN` (comma-separated, credentials true, no wildcard).

## AUTH

### Login
`POST /api/rvb/auth/login`
Body: `{ tag: string, password: string, native?: boolean }` + header `X-RVB-Client: native` for native.
- Web: sets `HttpOnly` `rvb_refresh_token` cookie, returns `{ success, accessToken, account, mustChangePassword }`
- Native (`X-RVB-Client: native` + explicit token): returns `{ success, accessToken, refreshToken, account, mustChangePassword }`
Status: `401 RVB_AUTH_INVALID_CREDENTIALS`, `423 RVB_AUTH_TEMPORARILY_LOCKED`, `400 RVB_TAG_REQUIRED`

### Refresh
`POST /api/rvb/auth/refresh`
- Web: send `Cookie: rvb_refresh_token`, returns `{ accessToken, account }` (no refresh JSON)
- Native: send JSON `{ refreshToken }` or header `X-Refresh-Token: <token>`, returns `{ accessToken, refreshToken, account }`
Rotation: atomic findAndUpdate `revokedAt`, creates new session with same `rotationFamilyId` + `clientType`. Old refresh invalidated. Socket `session:${oldId}` disconnected.
Errors: `401 RVB_REFRESH_REQUIRED`, `RVB_TOKEN_INVALID`, `RVB_TOKEN_EXPIRED`

### Change Password
`POST /api/rvb/auth/change-password` (Bearer access)
Body: `{ currentPassword, newPassword, confirmPassword }` (validate 8+ chars, confirm)
- Revokes all other sessions, rotates current session.
- Web: returns `{ accessToken, account }` + sets new `HttpOnly` cookie, **no** refresh in JSON.
- Native (trusted `session.clientType==='native'`): returns `{ accessToken, refreshToken, account }`
Errors: `400 RVB_PASSWORD_REQUIRED`, `401 RVB_AUTH_INVALID_CREDENTIALS`

### Logout
`POST /api/rvb/auth/logout` — revoke via `rvb_refresh_token` cookie or `Authorization: Bearer <access>` session. Clears cookie, disconnects `session:${id}`. Always `200`.

### Session Revoked Behavior
Any request with revoked/expired `sessionId` → `401 { code: "RVB_SESSION_REVOKED" }` (middleware `requireRvbAuth` + Socket handshake). Socket handshake also checks `RvbAccount.status !== active` → `RVB_ACCOUNT_DISABLED|ARCHIVED`.

### Onboarding
`GET /api/rvb/auth/me` returns `account` with `onboardingStatus: pending|complete`, `mustChangePassword`, `profilePicture`.
`PATCH /api/rvb/auth/profile` (self, `displayName` ≤80, `profilePicture` data URL <250k)
`PATCH /api/rvb/auth/preferences` body `{ notifications?: { chats, mentions, requests, orders, statusUpdates, reminders }, ui?: { language: "en"|"fr"|"ar", theme: "light"|"dark" } }` — notifications and ui are separate groups; patch preserves other group, fills defaults `ui: { language:"en", theme:"light" }`. Language is personal R.V.B preference (`preferences.ui.language` authoritative for authenticated users; pre-login uses localStorage fallback `rvb-ui-language`, on login account preference syncs and updates presentation without H.S.H Dexie).
`GET /api/rvb/auth/preferences` → `{ notifications: { chats, mentions, requests, orders, statusUpdates, reminders }, ui: { language, theme } }`
`POST /api/rvb/auth/onboarding` Body: `{ profilePicture: "data:image/jpeg;base64,..." }` — validates `data:image/` and <250k (frontend compresses 512×512 JPEG <200k via canvas). Sets `profilePicture`, `onboardingStatus=complete`. Derived from `req.rvbUser.accountId` (no `accountId` param).

**Guard order (web, mobile should enforce similar):**
Unauthenticated → `/rvb/login`
Authenticated + `mustChangePassword` → `/rvb/auth/change-password`
Password ok + `onboardingStatus===pending` → `/rvb/onboarding`
Complete → workspace. Allow `login|change-password|onboarding|logout` without loops.

### Token Storage (mobile)
- `refreshToken` → secure OS storage (Keychain/Keystore, `expo-secure-store`), **never** `AsyncStorage`/plain.
- `accessToken` → memory + secure storage, sent as `Authorization: Bearer <token>` and `handshake.auth.token`.
- On `RVB_SESSION_REVOKED` → clear storage, re-login.

## ROLES

`manager` — full R.V.B management
`admin` — full operational (same as manager)
`supervisor` — own Worker profile (salary/credit/financial, Payment/Loan/Discrepancy) + Customer management (list/create/edit/delete per safeguards, orders/requests), chats/directory/notifications/settings. No Accounts, no Supplier, no global Worker.
`worker` — own Worker profile/history/requests, chats/directory/notifications/settings
`supplier` — own Supplier profile/purchases/payments, New Supply/Discrepancy, chats/directory/notifications/settings
`customer` — own Customer profile/sales/payments, Place Order/Insert Shipment/Discrepancy, orders, chats/directory/notifications/settings

Frontend visibility ≠ security; all checks server-side via `requireRvbAuth` + `requireRvbRole` + ownership derived from `RvbAccount.linkedEntityId`.

## SELF / PORTAL ENDPOINTS

All derive `linkedEntityId` from `req.rvbUser` (never trust client `workerId` query).

`GET /api/rvb/portal/me` → `{ account, entity, entityType }`
`GET /api/rvb/portal/worker` → own Worker (worker/supervisor)
`GET /api/rvb/portal/worker/financial` → own `WorkerFinancialEvent[]` (server-filtered)
`GET /api/rvb/portal/worker/activities` → own `WorkerActivity[]`
`GET /api/rvb/portal/supplier` / `/supplier/purchases` / `/supplier/payments`
`GET /api/rvb/portal/customer` / `/customer/sales` / `/customer/payments` / `/customer/orders`
History endpoints use projections, never return all records unfiltered.

## MANAGEMENT ENDPOINTS

`GET/PATCH /api/rvb/accounts`, `GET /api/rvb/accounts/linkable?type=worker|supplier|customer&search=`, `GET /api/rvb/accounts/:id` (manager/admin only, returns `linkedEntityDisplayName`)

`GET/POST/PATCH /api/rvb/workers`, `POST /api/rvb/workers/:id/archive|reactivate`, `GET /api/rvb/workers/:id/financial-events|activities`, `POST /api/rvb/workers/:id/bonus-absence` (body `{type:"bonus"|"absence", amount:number, note?}`, transactional, `SyncChange`)

Similarly:
`GET/POST/PATCH/DELETE /api/rvb/suppliers`, `GET /api/rvb/suppliers/:id/purchases|payments` (delete guards: no purchases/payments, balance 0)
`GET/POST/PATCH/DELETE /api/rvb/customers`, `GET /api/rvb/customers/:id/sales|payments|orders` (delete guards: sale/payment/history, balance !=0)
Mutations create `SyncChange {entity:worker|supplier|customer, operation:create|update|delete, serverRevision}` for H.S.H incremental sync.

## REQUESTS / ORDERS

`GET/POST /api/rvb/worker-requests` (worker: own, supervisor: own, manager/admin: any), `POST /api/rvb/worker-requests/:id/review` (manager/admin)
Body worker request: `{ workerId, type:"payment"|"loan"|"discrepancy", amount?, description? }` — server validates `payment: amount <= worker.balance`, `loan: amount > worker.balance` (revalidated on review, loan increases balance), `discrepancy: topic/description ≤2000` (no direct mutation).

`GET/POST /api/rvb/supplier-requests`, `POST .../:id/review` — `new_supply: { supplierId, items:[{productId, quantity>0, weightKg>=0, price>=0, total}], total (server-computed), date }`, `discrepancy`. `new_supply` → `under_review` (no inventory change until accepted via `Purchase` transaction).

`GET/POST /api/rvb/customer-requests`, `POST .../:id/review` — `insert_shipment` (customer self, `items` validated, `under_review` → `Sale` on accept), `discrepancy`.

`GET/POST /api/rvb/customer-orders`, `PATCH /api/rvb/customer-orders/:id` (edit only `under_review`), `POST /api/rvb/customer-orders/:id/cancel`, `POST /api/rvb/customer-orders/:id/review` (manager/admin/supervisor per role). Structured validation: `items` array 1..50, `productId` exists, `quantity>0`, `weightKg>=0`, `price>=0`, `description<=2000`; server computes `item.total = round(weightKg*price)` and `order.total = sum(item.total)` (H.S.H semantics `weight*price`), ignores client total; **Customer price is server-authoritative**: at creation/edit (customer-originated) `price` is replaced with current `Product.price` (forged `price:0` overwritten), then recomputed. Supplier `new_supply` price is treated as proposal (under_review, no inventory change until accepted via `Purchase`). Manager/Admin/Supervisor during `Edit then Accept` may provide reviewed price (allowed, revalidated); otherwise stored authoritative price retained. Acceptance revalidates stock `quantity`/`weightKg` and weight is user-entered starting at `0`, not current inventory `weightKg`.

Errors: `400 RVB_ITEMS_TOO_MANY|PRODUCT_REQUIRED|QUANTITY_INVALID|WEIGHT_INVALID|PRICE_INVALID|DESCRIPTION_TOO_LONG`, `404 RVB_PRODUCT_NOT_FOUND`, `400 RVB_INSUFFICIENT_STOCK`, `409 RVB_ORDER_NOT_UNDER_REVIEW`.

## DIRECTORY

`GET /api/rvb/directory?search=&role=&limit=` (auth, returns `RvbAccount` identities, no financial fields). For chat creation: `POST /api/rvb/chats/dm`, `POST /api/rvb/chats/group`.

`GET /api/rvb/config` (all auth readable) → `{ currency, customerTypes, workerPositions }` — `currency` is company/business setting (manager/admin writable), readable by all authenticated. Language is **personal** via `preferences.ui.language`, not from config.
`PATCH /api/rvb/config` (manager/admin only, per `requireRvbRole`) → `SyncChange settings` (serverRevision, H.S.H incremental sync). Worker/Supplier/Customer/Supervisor read-only currency.

`GET /api/rvb/catalog/products?for=customer|supplier` → safe DTO `[{id,name,price,description,available}]` — **no** `quantity`/`weightKg`/`taxProfileId`/`serverRevision` leak. `available` boolean derived without exact stock. `for=customer` allowed for customer/manager/admin/supervisor; `for=supplier` allowed for supplier/manager/admin; worker/supplier mismatch → `403 RVB_FORBIDDEN`. `for` required enum; missing/invalid → `400 RVB_CATALOG_FOR_INVALID`. Manager/Admin internal exact stock via management endpoints if needed.

## NOTIFICATIONS

`GET /api/rvb/notifications?status=unread|read|archived|all&source=&priority=&date=&search=&page=&limit=` (only `channel=rvb`, per-recipient `RvbNotificationRecipient` state)
`GET /api/rvb/notifications/count` → `{ unreadCount, archivedCount }`
`POST /api/rvb/notifications/:id/read { unread?:boolean }` (mutates only own recipient)
`POST /api/rvb/notifications/:id/archive { archived?:boolean }` / `POST .../restore`
`POST /api/rvb/notifications/mark-all-read` / `POST /api/rvb/notifications/bulk { ids, action:read|unread|archive|restore }` (all scoped to `req.rvbUser.accountId`, 403 if not visible)
Channel: `hsh` (H.S.H sync) vs `rvb` (R.V.B); index `channel+sourceEventId` unique sparse; H.S.H bootstrap exposes `channel=hsh` only.

## ACTIVITY

`GET /api/rvb/activities?source=&search=&date=&actor=&page=&limit=` — redacts `sourceType=chats` details (`null`). Visibility: manager/admin full but chats only participant; supervisor own Worker + customer-management; worker/supplier/customer own linked entity + orders.

`GET /api/rvb/worker-activities?workerId=` (manager/admin any, worker/supervisor own, supplier/customer 403) — derived trusted.
`GET /api/rvb/worker-financial-events?workerId=` same.

## CHAT REST APIs

`GET /api/rvb/chats?category=main|secondary&search=` — **Web deep-link**: `?category=main|secondary` selects initial tab (invalid/missing → `main`); tab change syncs URL via `router.replace` without reload. **Mobile**: use in-memory `Main`/`Secondary` state, not query param.
`GET /api/rvb/chats/:id`
`POST /api/rvb/chats/dm { otherAccountId }` / `POST /api/rvb/chats/group { name, memberIds }`
`GET /api/rvb/chats/:id/messages?before=&limit=&search=` (participant only, soft delete preview)
`POST /api/rvb/chats/:id/messages { content, replyToMessageId?, reminderMinutes?:30|60|120 }` (per-account rate limit `10s 20`, `req.rvbUser.accountId` fallback IP; server computes `dueAt`, creates per-recipient `RvbChatReminder` only for mentioned/reply recipients, no generic flood)
`PATCH /api/rvb/chats/messages/:messageId` (edit <15m, own only)
`DELETE /api/rvb/chats/messages/:messageId` (soft)
`POST /api/rvb/chats/messages/:messageId/reaction` (toggle 🤝)
`POST /api/rvb/chats/:id/pin { messageId }` (max 3) / `unpin`
`POST /api/rvb/chats/:id/read { upToMessageId? }` (efficient `updateMany`)
`GET /api/rvb/chats/unread/counts` → `{ counts: Record<conversationId, number> }` (aggregation, exclude own/deleted/read)
Mentions: `@workers/@suppliers/@customers/@managers/@everyone` plus `@tag` (only active participants). Reply notifies original sender, deduped.

## SOCKET

`path: /api/rvb/chats/socket`
`auth: { token: "<accessToken>" }` or header `Authorization: Bearer <token>` — **query token rejected** (`?token=` → `RVB_UNAUTHENTICATED`).
Events:
- `rvb:notification { notification }` (per-user `user:${accountId}`)
- `chat:newMessage { conversationId, message }`
- `chat:messageEdited { message }`
- `chat:messageDeleted { messageId, conversationId }`
- `chat:reactionUpdated { message }`
- `chat:pinnedUpdated { conversation }`
- `chat:readReceipt { conversationId, accountId }`
- `chat:typing { conversationId, accountId, tag, isTyping }`
- `chat:unreadUpdate { conversationId }`
Rooms: `user:${accountId}`, `session:${sessionId}`, `role:${role}`, `conversationId`. Disconnect helpers: `disconnectRvbSession` (room `session:`) / `disconnectRvbAccount` (room `user:`) on logout/revoke/disable.

Reconnection: on `RVB_SESSION_REVOKED` clear tokens, re-login; else exponential backoff.

## COMMON ERRORS

`401 RVB_UNAUTHENTICATED`, `RVB_TOKEN_INVALID`, `RVB_SESSION_REVOKED`, `RVB_REFRESH_REQUIRED`, `RVB_TOKEN_EXPIRED`, `403 RVB_FORBIDDEN`, `RVB_ACCOUNT_DISABLED|ARCHIVED`, `404 RVB_ACCOUNT_NOT_FOUND|WORKER_NOT_FOUND`, `409 RVB_TAG_ALREADY_EXISTS|ENTITY_ALREADY_LINKED`, `400 RVB_ITEMS_TOO_MANY|PRODUCT_REQUIRED|QUANTITY_INVALID|INSUFFICIENT_STOCK`, `423 RVB_AUTH_TEMPORARILY_LOCKED`, `429 RATE_LIMITED`.

## WORKFLOW STATES

`under_review` → `accepted` | `rejected` | `cancelled` (customer order edit/cancel only `under_review`)

## PROFILE PICTURE / ONBOARDING

Canvas crop 512×512 max, JPEG quality ladder → <200k (backend <250k). `POST /api/rvb/auth/onboarding` sets `onboardingStatus=complete`.

## PAGINATION

`?page=&limit=` (limit max 100), response `{ total, page, limit, totalPages, unreadCount?, archivedCount? }`

## DATE / CURRENCY

`createdAt`, `dueAt` etc. as `number` (epoch ms). `currency` from `GET /api/rvb/config` (`DZD` etc.), `formatCurrency(amount, currency)` display; portal users read-only.

## SECURITY NOTES

- Never commit `.env` or secrets.
- Do not use `AsyncStorage` for refresh token.
- Do not trust client `total` **or customer `price`**; server recomputes from authoritative `Product.price` (customer forged price overwritten, supplier price is proposal).
- No `quantity`/`weightKg`/`taxProfileId` leak via catalog; `available` boolean only. New supply/order `weightKg`/`quantity` are user-entered starting at `0`, not current inventory weight.
- Portal self-service DTOs (`/api/rvb/portal/*`) return explicit safe DTOs without `syncStatus`/`serverRevision`/`lastSyncedAt` internal metadata (management APIs may retain more).
- Deep links (`route`) are hints; backend revalidates ownership.
- R.V.B has **no H.S.H Dexie dependency** (`settingsService`/`settingsRepository`/`lib/database/db`/`H.S.H repositories` forbidden under `/rvb`); settings are via `rvbUiPreferencesService` + `preferences.ui` + `rvbConfigService` (company currency) + lightweight `localStorage` theme (`hebrih-theme`). `triggerSync()` never reachable from `/rvb` settings.
- Rate limiting: unauthenticated (`login`/`refresh`) IP-based; authenticated submissions (`chat send`, `worker/supplier/customer requests`, `customer orders`) per-account via `req.rvbUser.accountId` after `requireRvbAuth`, IP fallback only if auth context unexpectedly missing (prevents NAT penalization).
- Supervisor: customer CRUD + orders/requests allowed (`manager`/`admin`/`supervisor`); workers/suppliers/accounts remain `403`.
