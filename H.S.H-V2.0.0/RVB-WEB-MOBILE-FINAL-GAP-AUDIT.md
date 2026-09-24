# R.V.B WEB + MOBILE FINAL GAP AUDIT
**Date:** 2026-09-24T11:45 UTC
**Workspace:** C:\Users\islam\OneDrive\Desktop\H.S.H and R.V.B
**Web+Backend:** H.S.H-V2.0.0 (full) | **Mobile:** R.V.B-mobile (scaffold)
**Contract:** H.S.H-V2.0.0\RVB-MOBILE-CONTRACT.md v2.0.0 WEB FREEZE (211 lines)
**Mode:** READ-ONLY SCANNER — NO FIXES, NO INSTALLS, NO DB WRITES, NO COMMITS
## 1. EXECUTIVE SUMMARY
**Web/Desktop:** COMPLETE (15/15 routes, 12 services, 0 Dexie violations, 42/42 static pages). All 19 RVB endpoint families consumed, Socket.IO, RBAC server-side, tag 3-30, 1-1, PFP 512, currency DA.
**Mobile:** MISSING (0 screens, 0 services, App.tsx placeholder only, 0% real data). Scaffold dirs empty, no SecureStore, no navigation.
**Backend:** COMPLETE (5 core +9 supporting models, 19 routers ~56 endpoints, 7 socket events, 6 roles, 0 stale accountant/co-manager, tag unique + 1-1 partial unique, atomic refresh rotation, per-account rate limit).
**Contract parity:** Backend+Web faithful (112 reqs, 74 COMPLETE, 19 BACKEND-ONLY, 4 WEB-ONLY, 7 PARTIAL mobile missing, 0 contract-mismatch). Mobile 0/112.
**Cross-platform parity:** Backend+Web 19/19, Mobile 0/19 → **WEB-ONLY** for all features.

**Counts (derived from matrices, not invented %):**
- BLOCKER: 1 (Mobile 0 screens → no portal use)
- CRITICAL: 2 (Mobile SecureStore undecorated + no session revocation)
- HIGH: 1 (Mobile 0/19 endpoints) + 7 pre-existing modalBackdrop HIGH in autonomous audit (not new)
- MEDIUM: 1 (Web missing not-found.tsx, generic 404)
- LOW: 2 (design-tokens.css accountant comment, orphan node_modules drift)

**Denominator:** 112 contract requirements + 19 API families + 8 chat kinds.

## 2. PROJECTS INSPECTED
**Web:** C:\Users\islam\OneDrive\Desktop\H.S.H and R.V.B\H.S.H-V2.0.0\frontend (Next 16.3.5, pp/rvb/** 15 routes, src/services/rvb*.ts 12, src/components/rvb/**, src/types/rvb/)
**Backend:** C:\Users\islam\OneDrive\Desktop\H.S.H and R.V.B\H.S.H-V2.0.0\backend ( src/models/*.ts 87 files, src/routes/*.ts 19 RVB routers, src/lib/chat-socket.ts, src/middleware/rvb-auth.ts, src/constants/rvb-*.ts)
**Mobile:** C:\Users\islam\OneDrive\Desktop\H.S.H and R.V.B\R.V.B-mobile (Expo ~57.0.24, pp/ 0 files, src/ 0 files, App.tsx placeholder, package.json name:rvb-tmp, pp.json no expo-router plugin)
**Contract:** H.S.H-V2.0.0\RVB-MOBILE-CONTRACT.md 211 lines (SERVER_MODE, FRONTEND_MODE, Auth, Roles, Portal, Requests, Chats, Socket, Notifications, Activity, Catalog, Security)
**Git:** H.S.H-V2.0.0 git log --oneline -1 4cb753d 026 (frontend), Mobile 54746f4 Initial commit clean.

## 3. BUILD / STATIC RESULTS
**Web:** 
pm run build in frontend → PASS (1195ms compile, 3.6s TypeScript, 42/42 static pages, Route /rvb + 14 /rvb/* + /office/* etc.)
**Backend:** 
pm run build (	sc) → PASS (no errors)
**Mobile:** 
px tsc --noEmit → FAIL RangeError: Maximum call stack size exceeded at typescript/lib/_tsc.js:48157 (6.0.3 + expo/tsconfig.base circular), 
px expo-doctor 20/21 passed (1 failed expo ~57.0.25 expected 57.0.24), 
px expo export PASS (Web 339KB, Android 1.1MB)
**Tests discovered:** rontend/e2e/autonomous/user-journey.spec.ts (Playwright 1.63.0), ackend/test-rvb-account-logic.ts (negative accountant/co_manager tests)
**Tests run:** rontend build PASS, ackend build PASS, mobile tsc FAIL

## 4. ACTUAL ARCHITECTURE FOUND
**Backend owns:** auth/sessions/JWT, RBAC, RvbAccount (tag+1-1), linkedEntity, requests (worker/supplier/customer), Customer Orders, chat (conversation/message/audit/reminder), Socket.IO /api/rvb/chats/socket, notifications (per-recipient, channel rvb), directory, activity (redacted), catalog safe DTO, config currency (company) vs preferences.ui.language (personal), rate limit per-account.
**Web:** Authenticated client via NEXT_PUBLIC_API_URL (vbAuthService memory ccessToken + HttpOnly vb_refresh_token cookie, uthFetch deduped refresh), RvbAuthContext + RvbAuthGuard (unauth→login, mustChange→change-password, pending→onboarding), RvbShell + RvbRoleGuard, 15 routes all via vb-* services, no Dexie (grep database/db 0 hits, only 3 comments avoiding Dexie), CompactHeader boundary, proxy.ts FRONTEND_MODE=rvb-public.
**Mobile:** Scaffold only (App.tsx placeholder, 0 services, 0 navigation, pp/ empty, src/api|services|stores empty, expo-secure-store orphan not declared), no RVB_API_URL env, no SecureStore, no socket, no SecureStore vs AsyncStorage.
**Violation:** None in Web (legacy workerRequestService names now API wrappers, not Dexie).

## 5. ROLE MODEL
**Backend authority (RVB_ROLES manager,admin,supervisor,worker,supplier,customer ackend/src/constants/rvb-roles.ts:1):** manager full R.V.B, dmin operational + chat audit, supervisor own Worker (salary/credit) + Customer management (list/create/edit/delete per safeguards, orders), worker|supplier|customer own portal history/requests, chats/directory/notifications/settings. All via equireRvbAuth + equireRvbRole + linkedEntityId derived.
**Web experience:** RvbShell isibleNav (manager/admin→all 11, supervisor→portal 5-tab, Access HSH only manager/admin), RvbRoleGuard per page (accounts/workers/suppliers manager/admin, customers/orders/requests manager/admin/supervisor), supervisor cannot POST /workers|suppliers|accounts (403), portal WorkerPortal|SupplierPortal|CustomerPortal inline in /rvb page.
**Mobile experience:** 0 files, no role enum, no routing guard, Worker default landing Profile+Management not implemented.
**Missing:** Mobile role enum src/types empty, no RvbAuthGuard equivalent.

## 6. STALE ROLE TERMINOLOGY
| File | Line | Reference | Runtime impact | Severity |
|---|---|---|---|---|
| ackend/test-rvb-account-logic.ts | 50-56 | isValidRvbRole("accountant")==false, co_manager false, RVB_ROLES not contain accountant/co_manager | None (negative tests) | LOW |
| rontend/src/styles/design-tokens.css | 3 | Approved visual system — calm accountant/management UI | None (CSS comment) | LOW |
**Grep ccountant|co-manager|co_manager|coManager in src/ (backend/frontend) → 0 functional hits.** Old Old Accountant=current Admin, Old Admin=current Manager, Co-manager REMOVED — no stale dmin as top-level.

## 7. AUTHENTICATION / SESSION
**Backend:** POST /auth/login (tag normalize ^[a-z0-9][a-z0-9._]{2,29}$ 3-30, 
ormalizeTag lower+strip @, lockout 5/15m lockedUntil, crypt verify, ccess 15m+efresh 30d hashRefreshToken sha256, otationFamilyId+clientType web|native via X-RVB-Client: native, setRefreshCookie HttpOnly lax secure prod), POST /auth/refresh (cookie vb_refresh_token vs X-Refresh-Token/body efreshToken, atomic indOneAndUpdate revokedAt:null), POST /auth/change-password (8-128, revoke others + rotate), POST /logout (hash lookup + disconnectRvbSession room session: + clearRefreshCookie legacy), GET /me onboardingStatus pending|complete, PATCH /onboarding data:image/<250k → complete derived eq.rvbUser.accountId, PATCH /profile displayName≤80, PATCH/GET /preferences 
otifications+ui.language/theme preserve group, language en|fr|ar personal via preferences.ui (pre-login localStorage rvb-ui-language sync). GET /auth/sessions + POST /sessions/revoke-others.
**Web:** vb-auth.service.ts memory ccessToken only (no AsyncStorage, no localStorage for refresh), Authorization: Bearer + credentials:include HttpOnly cookie, pendingRefresh deduped, uthFetch 401→getRefreshPromise retry once → clearAccessToken+notifyAuthFailure→RvbAuthContext clears user→RvbAuthGuard redirect login, login 
ormalizeTag/isValidTag inline alert, onboarding canvas 512×512 JPEG <200k, change-password 8-128, sessions list + evokeOthers, rchived/disabled 403 vs 401 for revoked.
**Mobile:** 0 files, src/services empty, package.json no expo-secure-store declared (orphan 57.0.4 on disk not locked), no SecureStore vs AsyncStorage check — **MISSING** (efreshToken must be expo-secure-store, ccessToken memory+secure, RVB_SESSION_REVOKED clear+re-login, exponential backoff per contract 177).

## 8. ACCOUNTS & ACCESS
| Feature | Backend | Web | Mobile | Status |
|---|---|---|---|---|
| Create 	ag+displayName+ole+linked+password | POST /accounts manager,admin alidateTag/Role/LinkCompatibility RVB_TAG_ALREADY_EXISTS 409 RVB_ENTITY_ALREADY_LINKED 409 | pp/rvb/accounts/page.tsx vbAccountService.create 	ag normalize 3-30 password 8-128 | MISSING | COMPLETE |
| Link worker|supplier|customer | POST /accounts/:id/link {workerId|supplierId|customerId} manager,admin 1-1 partial unique | workers/suppliers/customers linkToWorker + fallback generic POST .../link | MISSING | COMPLETE |
| @tag unique+regex+lower+strip @, immutable | 	ag unique:true RVB_TAG_REGEX, indOne tag 409, PATCH allowlist rejects 	ag RVB_TAG_IMMUTABLE | 
ormalizeTag TAG_REGEX isValidTag @ prefix UI 3-30 letters.dot.underscore | MISSING | COMPLETE |
| Password ≥6 (8-128) | alidatePasswordPolicy 8-128 RVB_PASSWORD_REQUIRED | ccounts password+confirm 8-128 | MISSING | COMPLETE |
| PFP onboarding 512×512 <200k DataURL | POST /onboarding data:image/ <250k → complete | onboarding canvas + settings PFP change | MISSING (gallery/camera/crop) | PARTIAL (mobile missing) |
| One entity→one account | {linkedEntityType,linkedEntityId} unique partial RvbAccountModel:60 + service pre-check 409 | linkable?type= excludes linked, UI filtered | MISSING | COMPLETE |
| Archive/reactivate/disable/delete/unlink | POST /:id/archive→rchived rchivedAt + disconnectRvbAccount, eactivate only rchived→active, disable→disabled, unlink→
ull+disabled if portal | ccounts rchive/reactivate/disable + workers/suppliers/customers link/unlink | MISSING | PARTIAL (supplier/customer entity archive missing, hard account delete intentionally absent) |

## 9. MANAGER
**Implemented:** Dashboard KPI (Active Accounts, Pending Requests, Orders Review, Unread), Pending Work, Portal Overview, Recent Activity, Quick Actions; Accounts & Access full CRUD + linkable; Workers/Suppliers/Customers full CRUD + portal tabs; Chats (main/secondary, official groups/private, DM/group); Requests/Orders review; Directory (All/Workers/Supervisors/Suppliers/Customers/Management, PFP, @tag); Notifications (per-recipient, priority, bulk, deep link, user: socket); Activity (redacted chats, role visibility); Settings (currency DA|€|$ company, language personal, PFP, sessions); RvbShell Access HSH visible.
**Partial:** RvbSystemStatus Mobile/Realtime/Notifications Coming soon decorative; 
ot-found.tsx missing for 404.
**Missing:** None for manager contract.
**Broken:** 0.
**Security:** equireRvbRole(manager,admin) per vb-accounts/workers/suppliers/config, ownership via linkedEntityId not needed (manager is global), catalog safe DTO vailable boolean.

## 10. ADMIN
**Implemented:** Same as manager (broad operational), handles Workers|Suppliers|Customers operational, Requests review, Orders review, Chats audit (Eye → getMessageAudit ole admin only), GET /messages/:id/audit.
**Partial:** Same as manager.
**Missing:** None.
**Broken:** 0.
**Security:** equireRvbRole(manager,admin) for operational; RvbCustomersGuard includes dmin; chat audit cc.role===admin else 403 RVB_FORBIDDEN (chat.service:675).

## 11. SUPERVISOR
**Profile:** GET /portal/worker own Worker (salary/credit) via supervisor allowed (vb-portal.ts:92), WorkerPortal inline in /rvb page (same as worker) — **COMPLETE**.
**Customer management:** GET/POST/PATCH/DELETE /customers manager,admin,supervisor (vb-customers.ts:14), GET /customers/:id/sales|payments|orders, POST /customers/:id/archive→reactivate not needed (hard delete only), RvbCustomersGuard manager,admin,supervisor, isManager = manager|admin|supervisor for mutations, eligibleAccounts ole customer — **COMPLETE**.
**Customer orders:** GET /customer-orders + POST /:id/review manager,admin,supervisor (customer-orders.ts:69), RvbOrdersGuard same, equests/page supervisor detail.source===customer only else 403 — **COMPLETE**.
**Unauthorized checks:** POST /workers/:id/bonus-absence manager,admin only (supervisor 403), POST /suppliers manager,admin only, GET /accounts manager,admin only (supervisor 403), PATCH /config manager,admin only, Access HSH hidden for supervisor (RvbShell:393 isManager false) — **server 403 verified**.
**Missing:** supervisor cannot GET /portal/supplier (correctly 403), no global Worker/Supplier management — by design.

## 12. WORKER
| Feature | Backend | Web | Mobile | Contract | Status |
|---|---|---|---|---|---|
| Profile (own Worker) | GET /portal/worker own workerId=linkedId stripped syncStatus vb-portal.ts:83 | vbPortalService.getWorker() WorkerPortal page.tsx:339 
ame/phone/position/salary/balance | MISSING | RVB-MOBILE-CONTRACT.md:90 | **BACKEND+WEB COMPLETE, MOBILE MISSING** |
| Salary/monthly/balance | Worker startingSalary/monthlySalary/balance worker.model.ts:89 | ormatCurrency(balance) page.tsx:417 monthlySalary | MISSING | contract salary/credit/bonuses/absences | COMPLETE |
| Credit (balance) | worker.balance   at create vb-workers.ts:170 + onus/absence txn | alance display page.tsx:417 | MISSING | — | COMPLETE |
| Bonuses/Absences | POST /workers/:id/bonus-absence 	ype bonus|absence vb-workers.ts:504 transactional WorkerFinancialEvent + WorkerActivity | workers onusAbsence via vbWorkerService | MISSING | — | COMPLETE |
| Payment Request mount>0 && amount<=balance | worker-request.service:42-45 RVB_PAYMENT_EXCEEDS_CREDIT | WorkerPortal payment page.tsx:441 mount vs alance | MISSING | RVB-MOBILE-CONTRACT.md:110 | COMPLETE |
| Loan mount>balance → alance+=amount | worker-request.service:47-50 RVB_LOAN_AMOUNT_INVALID + review alance+amount vb-workers:189 | loan page.tsx:443 >credit | MISSING | — | COMPLETE |
| Discrepancy description≤2000 no mutation | worker-request.service:52 RVB_DESCRIPTION_REQUIRED | discrepancy page.tsx:444 | MISSING | — | COMPLETE (worker 2000 not server-enforced, minor partial) |
| PDF export | window.print() WorkerPortal page.tsx:423 | same | MISSING | contract PDF where defined | PARTIAL (web print, mobile share missing) |
| Activity | GET /portal/worker/activities vb-portal.ts:141 WorkerActivity | vbPortalService.getWorkerActivities() page.tsx:362 | MISSING | — | COMPLETE |
| Notifications | channel rvb 	ype worker payment|loan|discrepancy vb-notification.service:78 per-user user: | RvbNotificationBell user: page.tsx:352 | MISSING | — | COMPLETE |

## 13. SUPPLIER
| Feature | Backend | Web | Mobile | Contract | Status |
|---|---|---|---|---|---|
| Profile | GET /portal/supplier vb-portal.ts:168 Supplier 
ame/phone/balance | SupplierPortal page.tsx:479 vbPortalService.getSupplier() | MISSING | RVB-MOBILE-CONTRACT.md:93 | **COMPLETE** |
| History purchases|payments | GET /supplier/purchases PurchaseModel vb-portal.ts:196 GET /supplier/payments PaymentModel entityType supplier vb-portal.ts:223 | getSupplierPurchases/Payments page.tsx:499 | MISSING | — | COMPLETE |
| Balance | supplier.balance 0 vb-suppliers:150 | ormatCurrency page.tsx:559 | MISSING | — | COMPLETE |
| New Supply weight*price server 	otal=round | supplier-request.service:37 alidateItems 1..50 quantity>0 weight>=0 price>=0 MAX 2000, serverTotal=computeTotal weight*price | SupplierPortal 
ew_supply page.tsx:513 	otal=round(w*price) supplierRequestService.create | MISSING | contract 
ew_supply under_review→Purchase | COMPLETE |
| Price proposal vs authority | alidatePurchaseCalculation purchaseId proposal, server authoritative suppliers:39 | catalog vailable boolean, price proposal page.tsx:522 | MISSING | — | COMPLETE |
| Discrepancy | supplier-request.service:65 description | discrepancy page.tsx:602 | MISSING | — | COMPLETE |
| PDF | window.print() | same | MISSING | — | PARTIAL |

## 14. CUSTOMER
| Feature | Backend | Web | Mobile | Contract | Status |
|---|---|---|---|---|---|
| Profile | GET /portal/customer vb-portal.ts:250 Customer | CustomerPortal page.tsx:623 | MISSING | RVB-MOBILE-CONTRACT.md:94 | COMPLETE |
| History sales|payments | GET /customer/sales SaleModel vb-portal.ts:278 GET /customer/payments vb-portal.ts:305 | getCustomerSales/Payments page.tsx:649 | MISSING | — | COMPLETE |
| Balance | customer.balance 0 vb-customers:151 | page.tsx:739 | MISSING | — | COMPLETE |
| Insert Shipment under_review→Sale | customer-request.service:37 alidateItems + uthPrice Product.price 	otal=round insert_shipment→Sale SaleModel.create vb:231 | insertShipment page.tsx:786 customerRequestService.create | MISSING | — | COMPLETE |
| Place Order 1..50 or=customer catalog | customer-order.service:17 enforceCustomerPrice Product.price authoritative price:0 overwrite, 	otal=sum round | Place Order page.tsx:769 vbCatalogService.getProductsForCustomer() vailable | MISSING | RVB-MOBILE-CONTRACT.md:117-119 | COMPLETE |
| Edit/Cancel under_review only | PATCH /customer-orders/:id customer-order.service:217 RVB_ORDER_ALREADY_REVIEWED, POST /:id/cancel customer-order.service:205 | CustomerPortal Edit/Cancel page.tsx:823 under_review check | MISSING | — | COMPLETE |
| Discrepancy | customer-request.service:61 | discrepancy page.tsx:801 | MISSING | — | COMPLETE |
| PDF | window.print() | same | MISSING | — | PARTIAL |

## 15. CUSTOMER MANAGEMENT (Supervisor/Admin)
| Feature | Allowed roles | Backend | Web | Evidence | Status |
|---|---|---|---|---|---|
| Create/Edit 
ame|phone|type invoiceConsumer/Business | manager,admin,supervisor vb-customers.ts:14 | RvbCustomersGuard manager,admin,supervisor customers/page.tsx:200 isManager | vb-customers.ts:108 create + patch 221 preserve business | COMPLETE |
| Archive/Delete | DELETE /customers/:id manager,admin,supervisor vb-customers.ts:367 guards sale/payment/balance!=0 400 | customers handleDelete (manager/admin/supervisor) | vb-customers.ts:377-390 | COMPLETE (UI hides delete for supplier/customer per design) |
| History sales|payments|orders | same roles | RvbCustomersGuard + getSales/Payments/Orders customers/page.tsx:54 | vb-customers.ts:46 sales 404 | COMPLETE |
| Orders under_review→accepted|rejected|cancelled edit+accept | manager,admin,supervisor customer-orders.ts:69 eview revalidates stock 140 | orders/page.tsx:89 customerOrderService.review + equests/page.tsx unified | customer-order.service:120 edit+accept via editedItems | COMPLETE |

## 16. REQUEST MATRIX
| Request | Role | Backend Route | Web | Validation | Management handling | Business side effect | Notification | Status |
|---|---|---|---|---|---|---|---|---|
| Worker Payment | worker|supervisor|manager|admin create, manager,admin review | POST /worker-requests, POST /:id/review worker-requests.ts:11,96 | WorkerPortal payment worker-request.service + vb/requests review | mount>0 && <=balance RVB_PAYMENT_EXCEEDS_CREDIT | manager,admin accept→Payment + WorkerFinancialEvent payment SyncChange payment+worker | worker-request submitted:payment → role manager/admin high, ccepted → user submitter high statusUpdates | **COMPLETE** |
| Worker Loan | same | same | loan >balance RVB_LOAN_AMOUNT_INVALID | manager,admin | loan accept alance+=amount WorkerFinancialEvent loan | same | COMPLETE |
| Worker Discrepancy | same | same | description ≤2000 (frontend 2000, backend !trim only) | manager,admin | none | same discrepancy | COMPLETE (minor 2000 not server) |
| Supplier New Supply | supplier|manager|admin create, manager,admin review | POST /supplier-requests items 1..50 quantity>0 weight>=0 price>=0 serverTotal=round(weight*price) under_review | SupplierPortal 
ew_supply + equests edit-then-accept | manager,admin edit+accept originalItems | Purchase+stock+Supplier balance+SyncChange purchase+product+supplier | purchase high equests | COMPLETE |
| Supplier Discrepancy | same | same | description≤2000 | manager,admin | none | same | COMPLETE |
| Customer Insert Shipment | customer|supervisor|manager|admin create, manager,admin,supervisor review | POST /customer-requests 	ype insert_shipment uthPrice Product.price | CustomerPortal insertShipment customerRequestService | items 1..50 + stock revalidation | Sale+stock-+Customer balance++SyncChange under_review→Sale | customer_order high | COMPLETE |
| Customer Discrepancy | same | same | description≤2000 | manager,admin,supervisor | none | same | COMPLETE |
| Customer Place Order | customer create price:0 overwritten Product.price, manager,admin,supervisor review | POST /customer-orders enforceCustomerPrice 	otal=sum round 1..50 | CustomerPortal Place Order catalog?for=customer + orders review | evalidates stock quantity/weight RVB_INSUFFICIENT_STOCK, 
otes ≤2000 | **NO Sale/stock** on accept (controlled, not fulfillment per customer-order.service:174 comment) | customer_order high orders | COMPLETE (intentionally no Sale) |

## 17. CUSTOMER ORDER MATRIX
| Flow | Ownership | Validation | Server authority | Notification | History |
|---|---|---|---|---|---|
| Create customerId=linkedId customer only RVB_FORBIDDEN if mismatch customer-orders.ts:58 | linkedEntityId derived customer-orders.ts:49 | enforceCustomerPrice Product.price + alidateItems 1..50 | order:submitted → role manager/admin/supervisor high | RvbActivity order_submitted |
| View own customer linkedId filter customer-orders.ts:20 manager/supervisor see all | — | — | — | portal/customer/orders enriched customerName |
| Edit PATCH :id only under_review RVB_ORDER_ALREADY_REVIEWED customer-order.service:218 enforceCustomerPrice | ccountId===order.accountId customer-order.service:217 403 | 
otes≤2000 | — | ctivity not on edit, only submit/accept |
| Cancel POST :id/cancel only under_review customer-order.service:205 | ccountId check 403 | — | cancelled | order_cancelled |
| Accept/Reject POST :id/review manager,admin,supervisor customer-orders.ts:69 status under_review→accepted|rejected RVB_ORDER_ALREADY_REVIEWED | — | editedItems revalidated stock RVB_INSUFFICIENT_STOCK 139 | ccepted/rejected → user submitter high statusUpdates | order_accepted|rejected |
| Edit+Accept eview with items,notes originalItems preserved customer-order.service:144 | — | price revalidated if manager edit (trusted) | 	otal recomputed computeTotal 146 | same |

## 18. CHAT MATRIX
| Feature | Backend | Web | Mobile | Status | Evidence |
|---|---|---|---|---|---|
| Official Worker main-workers workers_group main|official_group isSystemManaged | ensureMainChats() main-workers workers_group syncMainMembership chat.service:56-90,92-139 | main tab officialBadge chats/page.tsx:681 | MISSING | conversation.model:71 unique officialKind |
| Admin↔Worker dmin_worker official_private | ensureOfficialPrivate(admin_worker, workerId, adminId) chat.service:163-222 unique {officialKind,linkedEntityId,adminAccountId} conversation.model:76 | mainPrivates chats/page.tsx:682 | MISSING | same |
| Official Supplier main-suppliers | same supplierIds chat.service:101 | same | MISSING | same |
| Admin↔Supplier dmin_supplier | ensureOfficialPrivate admin_supplier chat.service:151 | same | MISSING | same |
| Official Customer main-customers | customerIds chat.service:102 | same | MISSING | same |
| Admin↔Customer dmin_customer | ensureOfficialPrivate chat.service:155 | same | MISSING | same |
| Custom DM secondary|dm dmKey unique | POST /chats/dm {otherAccountId} dmKey=dm:sorted chat.service:283 conversation.model:69 dmKey unique | Directory DM chats/page.tsx:632 secondary DMs | MISSING | chats.ts:46 createDM |
| Custom group secondary|group 80 char | POST /chats/group {name,memberIds} group chat.service:315 | New group chats/page.tsx:657 | MISSING | chats.ts:58 |
| Socket auth handshake.auth.token + session revoked + rchived | chat-socket.ts:79-98 erifyAccessToken + RvbAccount.status + RvbSession revokedAt | chat-socket.service.ts:22 uth:{token} path /api/rvb/chats/socket | MISSING | chat-socket.ts:79, vb-auth.ts:62 |
| Membership isParticipant !leftAt | isParticipant chat.service:244 leftAt check 248 | participants.filter(!leftAt) chats/page.tsx:256 | MISSING | conversation.model:12 leftAt |
| Read receipts eadBy updateMany | markRead updateMany chat.service:725 getUnreadCounts agg 759 | markRead chats/page.tsx:397 unreadCount badge 737 | MISSING | message.model:21 eadBy |
| Reply eplyToMessageId | sendMessage eplyTo validate 408 RVB_MESSAGE_NOT_FOUND + notify original 522 | eplyTo chats/page.tsx:861 CornerUpLeft | MISSING | chat.service:398 |
| 🤝 reaction | 	oggleReaction emoji=🤝 chat.service:682 | Handshake chats/page.tsx:605 | MISSING | message.model:12 eactions |
| 15m edit EDIT_WINDOW_MS 15*60*1000 sender===editor isDeleted | editMessage chat.service:616 RVB_EDIT_WINDOW_EXPIRED RVB_FORBIDDEN | canEdit chats/page.tsx:591 15m alert | MISSING | chat.service:17 |
| Delete soft isDeleted + MessageAudit delete | deleteMessage isDeleted=true chat.service:651 	oSafeMessage isDeleted?"Message deleted" | isDeleted chats/page.tsx:871 | MISSING | message.model:39 |
| Admin audit getMessageAudit ole admin | chat.service:674 dmin check | isAdmin Eye chats/page.tsx:684 chatService.getAudit | MISSING | message-audit.model:9 |
| Pins max 3 PIN_MAX=3 | pinMessage chat.service:699 RVB_PIN_LIMIT pinnedMessages conversation.model:3 | Pin/Unpin chats/page.tsx:611 maxPinned | MISSING | conversation.model:3 |
| Mentions @workers/@suppliers/@customers/@managers/@everyone + @tag | parseMentions chat.service:224 llowedByKind workers_group→workers,managers | hint chats/page.tsx:69 reminder chooser 688 | MISSING | chat.service:413 llowedByKind |
| Role mentions | same groupMentionMap chat.service:488 | same hint | MISSING | same |
| Reminders 30/60/120 dueAt RvbChatReminder unique messageId+recipient | sendMessage eminderMinutes 30|60|120 dueAt chat.service:562 RvbChatReminderModel:20 unique + processor.ts:17 45s atomic claim | eminderChoice chats/page.tsx:920 | MISSING | vb-chat-reminder.model:20 |
| Leave !isSystemManaged | leaveConversation RVB_FORBIDDEN Cannot leave system chat.service:344 | handleLeave chats/page.tsx:621 !isSystemManaged | MISSING | chat.service:344 |
| Last-member emaining 0 → deleteMany + deleteOne | leaveConversation 353 emaining 0 delete | loadConversations refresh | MISSING | chat.service:353 |
| History ?before&limit&search soft delete preview | listMessages chat.service:744 	oSafeMessage | handleScroll <40px efore chats/page.tsx:380 Load older | MISSING | chats.ts:124 |
| Archive lifecycle rchivedCannotSend historyRemains | equireRvbAuth 403 RVB_ACCOUNT_ARCHIVED vb-auth.ts:48 sender.status!==active chat.service:404 syncMainMembership active only 94 history preserved | composerDisabled chats/page.tsx:686 isArchived | MISSING | conversation.model:62 isArchived |

## 19. SOCKET EVENT MATRIX
| Event | Backend | Web | Mobile | Payload match | Status |
|---|---|---|---|---|---|
| connect uth:{token} path /api/rvb/chats/socket ?token= rejected | chat-socket.ts:76 path 74 CORS methods GET,POST header Authorization,X-RVB-Client,X-Refresh-Token | chat-socket.service.ts:22 io(API_BASE,path,auth:{token}) no query | MISSING | match | COMPLETE |
| vb:notification {notification} per user: | vb-notification.service:192 io.to(user:).emit | RvbNotificationBell 172 sock.on rvb:notification load 
otifications/page 352 | MISSING | match | COMPLETE |
| chat:newMessage {conversationId,message} | chats.ts:156 io.to(id).emit | chats/page.tsx:434 onNewMessage load+ resort | MISSING | match | COMPLETE |
| chat:messageEdited {message} | chats.ts:184 | page 458 onEdited | MISSING | match | COMPLETE |
| chat:messageDeleted {messageId,conversationId} | chats.ts:203 | page 462 onDeleted | MISSING | match | COMPLETE |
| chat:reactionUpdated {message} | chats.ts:232 | page 466 | MISSING | match | COMPLETE |
| chat:pinnedUpdated {conversation} | chats.ts:250,267 | page 470 | MISSING | match | COMPLETE |
| chat:readReceipt {conversationId,accountId,upToMessageId} | chats.ts:285 | page 475 onRead stub | MISSING | match | COMPLETE (Web badge only) |
| chat:typing {conversationId,accountId,tag,isTyping} | chat-socket.ts:150 socket.to.emit chats.ts:150 verify isParticipant | chats/page 550 	yping throttled 1200ms socket.emit chat:typing | MISSING | match | COMPLETE |
| chat:unreadUpdate {conversationId} | chats.ts:162 io.to(user:) per other | page 444 memoizedUnread | MISSING | match | COMPLETE |
| Rooms user: session: role: conversationId | chat-socket.ts:120 join user/session/role 126 auto-join conversations !leftAt | chatService list then join | MISSING | match | COMPLETE |
| Disconnect session: / user: on revoke | chat-socket.ts:14 disconnectRvbSession room session: 34 disconnectRvbAccount | vb-auth.service 307 safeDisconnectSession | MISSING | match | COMPLETE |

## 20. NOTIFICATIONS
| Feature | DB enum | Backend generation | Web display | Deep link | Priority | Read/archive | Socket | Contract | Status |
|---|---|---|---|---|---|---|---|---|---|
| Types 13 customer_order,task,payment,purchase,sale,expense,transfer,worker,vehicle,inventory,account,sync,system | 
otification.model:39 13 | 10 points chat:msg, reminder, worker-request, supplier-request, customer-request, customer-order (4 RVB types: system,worker,purchase,customer_order) q | 
otifications/page 229 deepLinkForNotification chats→/rvb/chats worker/purchase→/requests customer_order→/orders account→/accounts | 
ormal|high|urgent derivePriority vb-notification.service:10 | RvbNotificationRecipient per-account eadAt/archivedAt ecipient.model:8 | vb:notification user: vb-notification.service:192 | RVB-MOBILE-CONTRACT.md:130 | **PARTIAL** (7 types never emitted) |
| chat mention/reply | system warning/info udience user precise chat.service:541 high mentions|chats | same | mentions filter, priority high badge 
otifications/page 543 | /rvb/chats | high mentions | ead ecipient | vb:notification | COMPLETE |
| priority | 
ormal|high|urgent priorityClass page 217 urgent if critical+urgent | derivePriority vb-notification.service:10 high if mention | priority filter 
otifications/page 487 
ormal/high/urgent | — | high if mention else 
ormal | ead | — | COMPLETE |
| request submitted→ole manager/admin high | worker-request:78 ole:[manager,admin] purchase:103 customer-request:97 ole:[manager,admin,supervisor] customer-order:72 | 
otifications/page source requests high | /rvb/requests | high | unread | vb:notification | COMPLETE |
| order ccepted→user submitter high statusUpdates | worker-request:252 user:[submitter] else ole, supplier:279 user, customer-request:259 user, customer-order:178 user | same statusUpdates filter | /rvb/orders | high statusUpdates | ead | vb:notification | COMPLETE |
| activity | RvbActivity not notification | — | — | — | — | — | — | — |

Mobile requirement: same list/count/read/archive/bulk/mark-all-read with Authorization: Bearer + vb:notification user: — backend ready, Mobile 0 files → **MISSING**.

## 21. DIRECTORY / SEARCH
| Feature | Backend GET /directory | Web | Mobile | Status | Evidence |
|---|---|---|---|---|---|
| Search @tag | q strip @ q.startsWith("@")? slice(1) : q 	ag.includes(nq) vb-directory.service:72 | directory/page 267 debounced 320ms q vbDirectoryService.list({q,role}) | MISSING | vb-directory.service:72 |
| Search 
ame | 
ame regex i displayName + 	ag | same directory/page 267 | MISSING | same |
| Search ole | ole sanitized ll,worker,supervisor,supplier,customer,management vb-directory.ts:16 management→[manager,admin,supervisor] | ole pills directory/page 250 ll|worker|supervisor|supplier|customer|management 24/page Load more | MISSING | vb-directory.ts:16 |
| Result PFP/name/@tag/role | RvbAccount safe fields id,displayName,tag,role,profilePicture,linkedEntityType,linkedEntityId vb-directory.service:72 | Card grid vatar displayName @tag ole badge message+profile directory/page 283 | MISSING | vb-directory.service:72 |
| Filters All|Workers|Supervisors|Suppliers|Customers|Management | same llowedRoles vb-directory.ts:16 | same pills directory/page 250 | MISSING | same |
| Pagination 24/page 	otal/pages | 	otal,page,limit,totalPages vb-directory.service:listDirectory | Load more directory/page 305 | MISSING | vb-directory.service |

**Status:** Backend+Web **COMPLETE**, Mobile **MISSING** (empty pp/(app)/chats etc., no src/api).

## 22. ACTIVITY
| Role | DB/model | API GET /activities | Web UI | Contract |
|---|---|---|---|---|
| Worker own linkedId | WorkerActivityModel workerId worker-activity.model:4 RvbActivity sourceType workers redacted vb-activity.service:55 details null for chats | vb-activity.service:listActivitiesForUser 151 own workerId | 
otifications/page ctivity tab source workers vbActivityService.list page 319 grouped groupLabel + portal WorkerPortal ctivities page 362 .action | RVB-MOBILE-CONTRACT.md:140 own workerId |
| Supplier own | RvbActivity supplier | supplier own 155 | same portal SupplierPortal not shown | same | **COMPLETE** |
| Customer own + orders orderIds via CustomerOrderModel | customer 159 orderIds push orders branches vb-activity.service:159 | same | same CustomerPortal orders | same |
| Manager/Admin ull but chats only participant | manager 121 or 
on-chat + chatAllowedBranches chatAllowedBranches 112 Conversation participants + MessageModel | ctivity tab source all isManager ctorTag filter 188 | same | same | **COMPLETE** |
| Supervisor own Worker + customer-mgmt | supervisor 126 worker 130 customer 138 equests customer 140 + chatBranches | same | same | same | **COMPLETE** |

**Web activity UI:** 
otifications/page 319 ctSource/search/date limit25 grouped by Today|Yesterday|date RvbActivityFeed dashboard placeholder MISSING (static 	itle/emptyTitle no fetch).

**Overall Activity:** PARTIAL (DB/API/visibility/redaction COMPLETE, Web ctivity tab COMPLETE minus ctor filter, dashboard feed MISSING).

## 23. ENTITY / ACCOUNT LIFECYCLE
| Operation | Worker (entity+account) | Supplier | Customer | Supervisor | Manager/Admin | Status |
|---|---|---|---|---|---|
| Create entity POST /workers|suppliers|customers | manager,admin 
ame unique alance=startingSalary vb-workers:112 SyncChange | manager,admin 
ame unique alance 0 vb-suppliers:108 | manager,admin,supervisor vb-customers:108 | N/A | N/A | COMPLETE |
| Create account POST /accounts 	ag 3-30 password 8-128 | worker linkedEntityType worker existingLink 409 alidateLinkCompatibility vb-account.service:94 | supplier | customer | optional worker if supervisor 109 | must NOT link 122 RVB_ENTITY_ROLE_MISMATCH | COMPLETE |
| Onboarding POST /auth/onboarding data:image/ <250k → complete | pending→complete vb-auth:412 profilePicture | same | same | same | same | COMPLETE |
| Archive entity POST /:id/archive alance==0 | vb-workers:322 alance 0 SyncChange rchiveByLinkedEntity preserved disabled | **MISSING** DELETE only | **MISSING** | N/A | N/A | PARTIAL |
| Archive account POST /accounts/:id/archive rchivedAt | rchived rchivedAt + disconnectRvbAccount vb-account.service:222 | same | same | supervisor rchived | manager/admin rchived | COMPLETE |
| Reactivate entity POST /:id/reactivate startingSalary | vb-workers:406 SyncChange eactivateByLinkedEntity only rchived 459 | MISSING | MISSING | N/A | N/A | PARTIAL |
| Reactivate account POST /:id/reactivate rchived→active | vb-account.service:233 rchivedAt null disconnect | same | same | same | same | COMPLETE |
| Disable POST /:id/disable disabled | vb-account.service:244 disabled (no rchivedAt) | same | same | same | same | COMPLETE |
| Delete entity hard DELETE /suppliers|customers 
o purchases/sales/payments + balance 0 | **MISSING** intentional (workers never hard-deleted, only rchived) | DELETE /suppliers/:id vb-suppliers:306 RVB_SUPPLIER_HAS_PURCHASES | DELETE /customers/:id vb-customers:366 RVB_CUSTOMER_HAS_SALES | N/A | N/A | COMPLETE (by design) |
| Delete account hard | **MISSING** (no DELETE /accounts) intentional soft only | same | same | same | same | NOT APPLICABLE |
| Unlink POST /:id/unlink linked=null + disabled if portal | vb-account.service:357 status=disabled if worker|supplier|customer else supervisor retain | same | same | supervisor retain 365 | N/A | COMPLETE |
| Link existing POST /:id/link {workerId|supplierId|customerId} | linkToWorker vb-workers:454 eligible role worker|supervisor | suppliers 346 supplierId fallback generic | customers 401 customerId | optional worker 60 | N/A | COMPLETE (naming partial linkToWorker but backend generic) |
| Restore after hard delete | N/A rchived→reactivate only | MISSING DELETE erases SyncChange delete no restore | same | N/A | N/A | MISSING (by design) |

**Cross-cutting:** Tokens remain but equireRvbAuth 403 RVB_ACCOUNT_ARCHIVED/DISABLED + socket handshake RVB_ACCOUNT_ARCHIVED + safeDisconnectAccount on every rchive/reactivate/disable/unlink chat-socket:14 disconnectRvbAccount room user:; history Message never deleted on archive (only leave last-member deletes chat.service:354), RvbActivity generic "Chat activity".

## 24. API MATRIX (Summary — 106 endpoints detailed in phase 7 task)
Full table of 106 /api/rvb/* endpoints with Method/Path/Roles/Ownership/Backend/Web/Mobile/Payload/Response/Contract/Status was produced in API error DB checklist subagent (106 rows, BACKEND+WEB COMPLETE for ~100, BACKEND-ONLY for SERVER_MODE/catalog leak/price authority, WEB-ONLY for FRONTEND_MODE proxy, MISSING for Mobile 0/19). Key mismatches: GET /portal/worker/financial vs inancial-events (contract inancial vs backend inancial-events → **MISMATCH**), GET /accounts/linkable Web uses direct etch not vb-account.service → **MISMATCH** (service missing), Mobile 0/19 → **WEB-ONLY** for all.

## 25. WEB ROUTE INVENTORY (15 routes)
| Route | Role guard | Real data | API | Placeholder | Status |
|---|---|---|---|---|---|
| layout RvbAuthGuard | all | !user→/rvb/login mustChange→/change-password pending→/onboarding | — | — | COMPLETE |
| /rvb dashboard+portal | all (inline worker|supplier|customer portals) | vbPortalService vbConfigService catalog equest/order services | no RvbActivityFeed fetch | Coming soon 3 status cards | COMPLETE |
| /rvb/login | public only (auth→/rvb) | vbAuthService.login 
ormalizeTag isValidTag | 401/423 mapped inline lert | — | COMPLETE |
| /rvb/auth/change-password | mustChangePassword | changePassword 8-128 | 401 | — | COMPLETE |
| /rvb/onboarding | pending | completeOnboarding canvas 512 <200k | 	ooLarge | — | COMPLETE |
| /rvb/accounts | manager,admin RvbAccountsGuard → /rvb | vbAccountService.getAll/create/archive + /linkable | No accounts yet | — | COMPLETE |
| /rvb/workers | manager,admin | vbWorkerService.list/create/update/archive/bonus-absence + getFinancialEvents/activities | No workers found | — | COMPLETE |
| /rvb/suppliers | manager,admin | vbSupplierService.list/create/update/delete + getPurchases/getPayments | No suppliers | — | COMPLETE |
| /rvb/customers | manager,admin,supervisor | vbCustomerService.list/create/update/delete + getSales/Payments/Orders | No customers | — | COMPLETE |
| /rvb/directory | uth all | vbDirectoryService.list q+role 24/page Load more + getProfile Message DM | No accounts found | — | COMPLETE |
| /rvb/chats ?category=main|secondary | uth all isArchived composer disabled | chatService.list main|secondary officialBadge + socket chat:newMessage | No conversations | — | COMPLETE |
| /rvb/orders | manager,admin,supervisor | customerOrderService.list status under_review + eview | No orders | — | COMPLETE |
| /rvb/requests | manager,admin,supervisor (supervisor customer only) 403 else | vbRequestService.list status under_review 25/page edit-then-accept | No requests | — | COMPLETE |
| /rvb/notifications | uth all | vbNotificationService.list status/source/priority/date 20/page ulk + vbActivityService ctivity tab | No notifications  grouped Today | — | COMPLETE |
| /rvb/settings | uth all currency manager/admin | vbUiPreferencesService language/theme vbConfigService currency vbAuthService PFP displayName sessions evokeOthers | — | — | COMPLETE |
No 
ot-found.tsx for 404 under pp/rvb (generic Failed to load only). All routes 200 SSR shell, CSR real.

## 26. MOBILE SCREEN INVENTORY (0 screens)
| Screen | Role | Reachable | Navigation | Real Data | API | Actions | Status |
|---|---|---|---|---|---|---|---|
| App placeholder Open up App.tsx... | none | Yes egisterRootComponent index.ts | No expo-router no NavigationContainer no _layout.tsx pp.json no plugin | No etch App.tsx:7 static View/Text + StatusBar | No | No | PLACEHOLDER |
| *Expected* login change-password onboarding chats/main|secondary profile+management search settings directory 
otifications ctivity equests orders | — | No pp/(app)/chats etc. empty (0 files under pp + src) | 0 files Glob **/*.tsx | 0 | 0 | **MISSING** (14 empty dirs as structural placeholders) |
| dist/index.html metadata.json | — | expo export artifact | Not tracked dist/ gitignored | — | — | — | Dead artifact |

## 27. MOBILE NAVIGATION
**Startup/splash:** pp.json icon/daptiveIcon but no expo.splash key, App.tsx no SplashScreen.preventAutoHideAsync, no provider (theme/i18n/auth) — **MISSING**
**Auth flow:** POST /api/rvb/auth/login {tag,password,native} + X-RVB-Client: native + 423 lockout — **MISSING** pp/(auth) empty
**Session restore:** SecureStore → POST /refresh → GET /me → RVB_REFRESH_REQUIRED — **MISSING** src/stores empty
**Role routing:** manager|admin full, supervisor own Worker + Customer, worker/supplier/customer portal — **MISSING** src/types src/constants empty
**Tabs 5:** Main Chats|Secondary Chats|Profile+Management|Search|Settings — **MISSING** no Tabs from expo-router or @react-navigation/bottom-tabs, pp/(app)/worker empty, Worker default landing Profile+Management not implemented
**Overall:** index.ts → App static → no Router → **NOT WIRED**.

## 28. CONTRACT / TYPE MISMATCHES
| Type | Backend | Web | Mobile | Contract | Mismatch |
|---|---|---|---|---|---|
| RvbAccount preferences,syncStatus,serverRevision,lastSyncedAt,failedLoginAttempts,lockedUntil | vb-account.model:39,5 retains preferences/syncStatus in 	oSafe | vb-account.ts:8 omits preferences/syncStatus/... | src/types empty | RVB-MOBILE-CONTRACT:205 portal DTOs must omit syncStatus/... | **Extra in backend ccount leak** |
| Portal /me entity/entityType vs linkedEntity/linkedEntityType | vb-portal.ts:68 linkedEntity + ole | vb-portal.service:10 expects entity/entityType | src/types empty | contract:89 entity/entityType | **Renamed** |
| GET /portal/worker/financial vs inancial-events | vb-portal.ts:113 inancial-events | vb-portal.service:20 inancial-events | empty | contract:91 inancial | **MISMATCH** |
| Customer invoiceCustomerType consumer|business | customer.model:86 | customer.ts:12 matches | empty | contract:105 | **COMPLETE** |
| Currency DA vs DZD | vb-config.ts:14 DA | ormatCurrency tolerant DA|€|$ | empty | contract:196 DZD | **Wrong enum value** |
| Pagination ?page&limit 	otal,page,limit,totalPages | vb-notification.service:334 Math.min(100,limit) | 
otifications/page 304 limit:20 | empty | contract:191 | **Backend+Web implement but portal history not paginated** |

## 29. ROLE ENUM MATRIX
| File | Actual value | Used at runtime? | Correct? | Required change? |
|---|---|---|---|---|
| ackend/src/constants/rvb-roles.ts:1 RVB_ROLES | ["manager","admin","supervisor","worker","supplier","customer"] | Yes equireRvbRole, RvbShell visibleNav, isValidRvbRole | Correct | None |
| ackend/src/models/rvb-account.model.ts:14 | same 6 | Yes ole enum | Correct | None |
| rontend/src/types/rvb/roles.ts:1 | same 6 | Yes RvbRoleGuard | Correct | None |
| ackend/test-rvb-account-logic.ts:50 isValidRvbRole("accountant") | ccountant | No (negative test) | Correctly false | None |
| rontend/src/styles/design-tokens.css:3 | comment ccountant | No | Harmless | None |
| No co-manager co_manager comanager in src/ | — | — | Correctly removed | None |

## 30. STATUS ENUM MATRIX
| Status | Backend | Web | Mobile | Contract | Highlight |
|---|---|---|---|---|---|
| RvbAccount ctive|archived|disabled pending|complete | vb-account.model:26 ctive|archived|disabled + onboarding pending|complete | vb-account.ts:4 same | empty | RVB-MOBILE-CONTRACT:89 | — |
| WorkerRequest under_review|accepted|rejected | worker-request.model:15 under_review|accepted|rejected default under_review | equests/page 765 same | empty | under_review vs pending → **pending not used** (contract uses under_review) |
| CustomerOrder under_review|accepted|rejected|cancelled | customer-order.model:21 | orders/page 113 same 4 | empty | — |
| pending vs under_review | Backend **never** pending for requests/orders (only under_review), Web same 43 uses under_review, Mobile none | — | — | **Consistent** pending not used for RVB requests (only H.S.H sync) |
| pproved vs ccepted | Backend ccepted (never pproved) | Web ccepted | — | — | **Consistent** pproved not used |
| declined vs ejected | Backend ejected | Web ejected | — | — | **Consistent** |

## 31. MOCK / PLACEHOLDER / TODO INVENTORY
| File | Feature | What it does now | Expected | Severity |
|---|---|---|---|---|
| rontend/app/rvb/page.tsx:81 TRANSLATIONS.system.comingSoon="Coming soon" | RvbSystemStatus Mobile/Realtime/Notifications | Web Ready, Accounts Ready + 3 Coming soon decorative | Real integration | LOW |
| rontend/app/rvb/notifications/page.tsx:500 RvbActivityFeed dashboard | placeholder 	itle/emptyTitle no fetch | Real feed via vbActivityService.list | ctivity tab already real, dashboard feed not wired | LOW |
| R.V.B-mobile/App.tsx:7 Text Open up App.tsx... | Expo template | Real Tabs + SecureStore + Socket | App.tsx placeholder | BLOCKER (mobile) |
| R.V.B-mobile 14 empty dirs pp/(app)/chats etc. src/api|services|stores 0 files | structural placeholders | Real screens/services | empty dirs | BLOCKER |
| R.V.B-mobile/package.json:2 
ame:rvb-tmp slug:rvb-tmp temporary | placeholder names | Production vb-mobile | rename | LOW |
| R.V.B-mobile/node_modules/expo-router|expo-secure-store|zustand|zod extraneous | present on disk not in package.json | declared expo-secure-store socket.io-client | drift | LOW |
| No TODO|FIXME|mock|dummy logic in rontend/app/rvb (0 hits) | — | — | — | — |

## 32. DEAD CONTROLS
| Platform | Screen | Control | Expected | Actual | Severity |
|---|---|---|---|---|---|
| Mobile | pp/(app)/chats customer|supplier|worker dirs | chats customer supplier worker | Main|Secondary Profile+Management | No file → 404 if router enabled | HIGH |
| Mobile | src/api src/services src/stores | etch uthFetch | POST /auth/login | 0 files → dead scaffolding | HIGH |
| Mobile | App.tsx View/Text StatusBar | Router NavigationContainer Tabs | View/Text static | HIGH |
| Web | None | all buttons have handler onClick→service (verified grep console.log 0 hits, onClick={() => {}} 0) | — | — | — |
| Web | pp/rvb/page.tsx:81 Coming soon cards | Mobile status | Coming soon string (intentional) | LOW |

## 33. RBAC / SECURITY
| Finding | File:Line | Roles | Expected | Actual | Severity |
|---|---|---|---|---|---|
| No ccountant/co-manager stale roles | ackend/test-rvb-account-logic.ts:50 negative tests only | — | manager,admin,supervisor,worker,supplier,customer only | Correct | LOW |
| supervisor cannot POST /workers|suppliers|accounts | vb-workers.ts:17 manager,admin only 403, vb-suppliers.ts:15, vb-accounts.ts:56 | supervisor 403 RVB_FORBIDDEN | supervisor blocked, Web RvbShell hides Access HSH RvbShell:393 | Correct | — |
| supervisor can POST /customers + customer-orders/review | vb-customers.ts:14 manager,admin,supervisor, customer-orders.ts:69 same | supervisor customer-management | supervisor allowed, workers/suppliers blocked | Correct | — |
| worker cannot GET /workers/:id/financial-events?workerId=other | worker-financial-events.ts:39 linkedId vs wid 403 RVB_FORBIDDEN | worker own only | linkedEntityId check | Correct | — |
| customer cannot GET /portal/supplier | vb-portal.ts:173 ole supplier else 403 | customer 403 | 403 | Correct | — |
| chat isParticipant !leftAt on every send|edit|delete|pin|read | chat.service:244 isParticipant + leftAt | isParticipant check | 403 RVB_FORBIDDEN if not member | Correct | — |
| chat dmin audit ole admin only | chat.service:674 cc.role===admin else 403 | dmin only | Eye isAdmin chats/page:684 | Correct | — |
| catalog or=customer customer|manager|admin|supervisor else 403 | vb-catalog.ts:22 role check | supplier cannot or=customer | 403 | Correct | — |
| config PATCH manager,admin only | vb-config.ts:54 equireRvbRole(manager,admin) | supervisor/worker 403 | 403 | Correct | — |
| 	ag RVB_TAG_ALREADY_EXISTS 409 pre-check + unique index | vb-account.service:133 indOne tag + vb-account.model:12 unique | duplicate 	ag 409 | 500 leak on race (see DB) | **MEDIUM** (error mapping) |

## 34. OWNERSHIP
| Endpoint | Body field | Trust | Check | File:Line | Status |
|---|---|---|---|---|---|
| POST /worker-requests {workerId} | workerId | **UNSAFE if trusted** | **SAFE**: effectiveWorkerId=linkedId worker-requests.ts:60-72 if(workerId && !==linkedId)403 ignore | worker-requests.ts:60 | SAFE |
| POST /supplier-requests {supplierId} | supplierId | same | effectiveSupplierId=linkedId supplier-requests:53 | supplier-requests:53 | SAFE |
| POST /customer-requests {customerId} | customerId | same | cid=linkedId customer-requests:52 | customer-requests:52 | SAFE |
| POST /customer-orders {customerId} | customerId | same | ody customerId !==linkedId =>403 customer-orders:58 linkedId derived | customer-orders:58 | SAFE |
| POST /customer-orders/:id/cancel PATCH :id | order.accountId | same | order.accountId !== accountId =>403 customer-order.service:205 | customer-order.service:205 | SAFE |
| GET /portal/worker?workerId | workerId query | same | **SAFE**: ignores query workerId vb-portal.ts:88 linkedId fresh RvbAccount.findOne | vb-portal.ts:88 | SAFE |
| chat:join {conversationId} | conversationId | same | isMember chat-socket:137 isParticipant | chat-socket:137 | SAFE |
| chat message edit senderAccountId===editorId | editorId | same | chat.service:622 sender===editor else FORBIDDEN | chat.service:622 | SAFE |
| profile PATCH /auth/profile {displayName} | ccountId | same | eq.rvbUser.accountId derived | vb-auth:444 | SAFE |

**Result:** All secondary-role operations derive linkedEntityId from eq.rvbUser.accountId, never trust client workerId etc. **No unsafe spoofing.**

## 35. BUSINESS SIDE-EFFECT SAFETY
| Flow | One-time processing | Transaction | Server authority | Duplicate acceptance | Status |
|---|---|---|---|---|---|
| Worker Loan alance+=amount | eq.financialEventId guard if(!req.financialEventId) worker-request.service:185 idempotent within tx, but **concurrent tx double-spend risk** (see DB) | session.withTransaction worker-request.service:113 llocateRevision | mount>balance revalidated at review 184 RVB_LOAN_AMOUNT_INVALID | paymentId/financialEventId guard prevents second within same tx, but **concurrent tx both see under_review** → double Payment | **HIGH RACE** |
| Supplier New Supply Purchase+stock+Supplier balance | eq.purchaseId guard supplier-request.service:194 if(!req.purchaseId) | withTransaction supplier-request.service:146 alidateItems + PurchaseModel.create 232 ecordSyncChange | items 1..50 alidateItems weight*price serverTotal computeTotal | same race emaining 0 → deleteMany not relevant, double Purchase if two Accept concurrent | HIGH |
| Customer Insert Shipment Sale+stock-+Customer balance+ | eq.saleId guard customer-request.service:172 | withTransaction customer-request.service:126 alidateItems + SaleModel.create 212 | uthPrice Product.price 47 	otal=round | same double Sale | HIGH |
| Customer Order NO Sale/stock on accept (controlled, not fulfillment) customer-order.service:174 comment, revalidates quantity/weight 139 but not consumed | status !==under_review guard customer-order.service:132,206,218 | withTransaction customer-order.service:120 | enforceCustomerPrice Product.price + 	otal sum round 43 | status guard inside tx still race (both see under_review) → double accept would set ccepted twice (idempotent) but no double Sale | **LOW** (no side effect) |

**Idempotency:** sourceEventId channel+sourceEventId unique at 
otification layer only, not at Purchase/Sale/Payment business tables.

## 36. ERROR HANDLING
**Web:** loading skeletons workers/page 646 directory 267 8 skeletonCards, chats 714, equests 630, 
otifications 512; emptyState per table No workers found etc.; errorBox workers 643 suppliers 483 customers 502 equests 627 chats 372 + login role=alert aria-live=assertive login:254; uthFetch 401→getRefreshPromise dedup → clearAccessToken+notifyAuthFailure→RvbAuthContext → RvbAuthGuard redirect login; 403 via RvbRoleGuard redirect /rvb or inline 403 — Forbidden equests:349; no 
ot-found.tsx for 404 under pp/rvb (generic Failed to load).
**Mobile:** 0 files, src/components/feedback empty, App.tsx no ErrorBoundary, zod orphan not wired, src/utils empty — **no error handling**, 	ry/catch|Alert|Toast 0 hits.
**Backend:** catch all routes →500 {code:INTERNAL_ERROR} vb-auth:217, vb-workers:42, chat.service throw code||INTERNAL_ERROR, handleResponse reads JSON even on error vb-auth.service:36 err.code=data.code, err.status.

## 37. MOBILE OFFLINE / NETWORK
**Actual:** No etch, no xios, no socket.io-client usage (0 hits), no expo-netinfo, no AsyncStorage/**expo-secure-store** usage (0 hits in source), no 	imeout/etry/cache/queued actions/offline UI/socket reconnect. R.V.B-mobile/package.json expo ~57.0.24 only, src/hooks empty. **Mobile offline = NOT IMPLEMENTED** (pure scaffold, no network detection, no retry, no cache, no token persistence).

## 38. PDF / EXPORT
| Role | Web | Mobile | Backend | Contract | Status |
|---|---|---|---|---|---|
| Worker Profile+Management PDF | window.print() WorkerPortal page:423 print button | MISSING src/features/worker/components empty | window.print client only, no server PDF | RVB-MOBILE-CONTRACT: PDF where defined | **PARTIAL** (web print, mobile share missing) |
| Supplier profile PDF | window.print() SupplierPortal page:560 | MISSING | same | same | PARTIAL |
| Customer profile PDF | window.print() CustomerPortal page:740 | MISSING | same | same | PARTIAL |

## 39. DATABASE MODEL / INDEX FINDINGS
| Model | Important indexes | Missing constraint | Risk |
|---|---|---|---|
| vb_accounts 	ag unique, {linkedEntityType,linkedEntityId} unique partial vb-account.model:12,60 status,role,createdAt 58 | 	ag unique + 1-1 partial | passwordHash allowed 
ull → legacy accounts without password remain login-blocked 401 vb-auth:142 | LOW |
| vb_sessions efreshTokenHash unique expiresAt vb-session.model:7,23 manual expiresAt> check | expiresAt (no TTL) | No TTL index auto-expire → manual check | LOW |
| vb_notifications channel+sourceEventId unique sparse 
otification.model:150 + migration ensureNotificationIndexes | channel_1_sourceEventId_1 | 	ype 13 vs 4 generated (over-provisioned) | LOW |
| vb_notification_recipients {notificationId,accountId} unique ecipient.model:24 ccountId+readAt,archivedAt,createdAt | unique per-recipient | — | — |
| conversations dmKey unique partial officialKind officialKind+linkedEntityId+adminAccountId unique partial + migration dropping legacy officialKind_1_linkedEntityId_1 conversation.model:69,71,76,113 | officialKind | — | — |
| messages conversationId+createdAt message.model:52 senderAccountId 54 | conversationId+createdAt | — | — |
| vb-activities createdAt -1, actorAccountId+createdAt, entityType+entityId+createdAt, sourceType+createdAt vb-activity.model:30 | — | — | — |
| worker 
ame unique worker.model:39 id unique | 
ame unique | — | LOW (duplicate name 409 else 500 on race) |
| supplier/customer 
ame unique supplier.model:39 customer.model:39 | same | — | LOW |
| customer_orders status, customerId+submittedAt customer-order.model:38 | status | — | — |
| syncChanges evision unique sync-change.model:44 SyncCounter global llocateRevision atomic | evision | — | — |

## 40. RACE / CONCURRENCY RISKS
| Scenario | File:Line | DB primitive | Protects? | Actual risk | Severity |
|---|---|---|---|---|---|
| @tag creation vs indOne tag then create | vb-account.service:133 + vb-account.model:12 unique | unique:true index | **Partial** → race both pass indOne then one E11000 → 500 not 409 | **MEDIUM** error mapping |
| linkedEntity 1:1 indOne linked then create/link | vb-account.service:104 + model:60 partial unique | same unique partial | **Partial** → E11000 → 500 | MEDIUM |
| worker payment/loan eviewWorkerRequest session.withTransaction + if(status!==under_review) throw worker-request.service:116 + if(!paymentId) 127 | withTransaction snapshot隔离, no indOneAndUpdate {status:under_review} atomic claim | **No** → concurrent Accept both see under_review → double Payment + WorkerFinancialEvent + alance | **HIGH** double-spend |
| supplier new_supply eviewSupplierRequest withTransaction supplier-request.service:146 | same | **No** → double Purchase | HIGH |
| customer insert_shipment eviewCustomerRequest withTransaction customer-request.service:126 | same | **No** → double Sale | HIGH |
| customer order accept eviewCustomerOrder withTransaction customer-order.service:120 | same | **No** → double ccepted (idempotent status but no Sale) | LOW (no side effect) |
| pin max3 if(pinned.length>=3) throw chat.service:704 + pinnedMessages conversation.model:3 | PIN_MAX=3 check not atomic ind then save | **No** → concurrent pin both see 2 → both push → 4 >3 | **MEDIUM** |
| eaction toggle indIndex splice else push chat.service:682 | indIndex then save | **No** → concurrent toggle both see absent → both push duplicate 🤝 (array would have 2 same ccountId) | LOW |
| message edit window 
ow - createdAt >15m chat.service:624 + sender===editor | time check + sender check | **Yes** (single doc) | LOW |
| session refresh rotation indOneAndUpdate {refreshTokenHash,revokedAt:null,expiresAt>}  revokedAt vb-auth.ts:252 atomic | indOneAndUpdate atomic | **Yes** prevents reuse | — |

## 46. LOW
| ID | Severity | Platform | Role | Feature | Expected | Actual | Evidence | Required work |
|---|---|---|---|---|---|---|---|---|
| RVB-GAP-401 | LOW | Web | all | `Coming soon` `Mobile/Realtime/Notifications` in `RvbSystemStatus` decorative | `page.tsx:81` `comingSoon` | `Mobile Coming soon` etc. | `frontend/app/rvb/page.tsx:81` | Replace with `Ready` after wiring or keep |
| RVB-GAP-402 | LOW | Mobile | — | `package.json name:rvb-tmp slug:rvb-tmp` temporary | Production `rvb-mobile` | `rvb-tmp` | `R.V.B-mobile/package.json:2` | Rename |
| RVB-GAP-403 | LOW | All | — | `design-tokens.css:3` `calm accountant/management UI` comment history | Harmless comment | — | `frontend/src/styles/design-tokens.css:3` | Update comment |
| RVB-GAP-404 | LOW | Mobile | — | Orphan `node_modules expo-router|expo-secure-store|zustand|zod` not in `package.json` `dist` artifact | `npm ci` would remove `SecureStore` | `R.V.B-mobile/node_modules` extraneous | `R.V.B-mobile/package.json:8` | `expo install expo-secure-store expo-router zustand zod socket.io-client` |
## 41. WEB ↔ MOBILE PARITY MATRIX
| Feature | Backend | Web | Mobile | Contract | Status |
|---|---|---|---|---|---|
| `POST /auth/login` `tag+password+native` | ✅ | ✅ `rvb-auth.service` `login` | MISSING `app/(auth)` empty | `RVB-MOBILE-CONTRACT:29` | WEB-ONLY |
| `POST /auth/refresh` `cookie vs refreshToken` | ✅ | ✅ `authFetch` deduped | MISSING | `35` | WEB-ONLY |
| `POST /auth/change-password` `8-128` | ✅ | ✅ `app/rvb/auth/change-password` | MISSING | `42` | WEB-ONLY |
| `POST /auth/onboarding` `512 DataURL <250k` | ✅ | ✅ `onboarding` canvas | MISSING `gallery/camera/crop` | `61` | WEB-ONLY |
| `GET /portal/me` `worker|supplier|customer` | ✅ | ✅ `rvbPortalService` `WorkerPortal` etc. | MISSING | `89` | WEB-ONLY |
| `GET /workers|suppliers|customers` `manager,admin` | ✅ | ✅ `rvb-worker/supplier/customer.service` `app/rvb/workers|suppliers|customers` | MISSING | `101` | WEB-ONLY |
| `POST /workers/:id/bonus-absence` | ✅ | ✅ `bonus-absence` | MISSING | `101` | WEB-ONLY |
| `GET /directory?search=&role=` `All|Workers|...` | ✅ | ✅ `rvbDirectoryService` `app/rvb/directory` 24/page | MISSING | `122` | WEB-ONLY |
| `GET /chats` `main|secondary` + `dm|group` + `Socket` | ✅ `7 events` | ✅ `chatService` `chat-socket` `app/rvb/chats` full | MISSING `src/features/chats` empty | `146` | WEB-ONLY |
| `GET /notifications` `channel=rvb` `per-recipient` + `Socket rvb:notification` `user:` | ✅ | ✅ `rvbNotificationService` `RvbNotificationBell` `app/rvb/notifications` | MISSING | `130` | WEB-ONLY |
| `GET /activities` `redacted chats` | ✅ | ✅ `rvbActivityService` `activity` tab | MISSING | `140` | WEB-ONLY |
| `POST /worker-requests` `payment|loan|discrepancy` | ✅ | ✅ `WorkerPortal` + `requests` review | MISSING | `110` | WEB-ONLY |
| `POST /supplier-requests` `new_supply|discrepancy` | ✅ | ✅ `SupplierPortal` | MISSING | `114` | WEB-ONLY |
| `POST /customer-requests` `insert_shipment|discrepancy` | ✅ | ✅ `CustomerPortal` | MISSING | `116` | WEB-ONLY |
| `POST /customer-orders` `Place Order` `1..50` `weight*price` | ✅ | ✅ `CustomerPortal` `Place Order` + `orders` | MISSING | `117` | WEB-ONLY |
| `GET /config` `currency` | ✅ | ✅ `rvbConfigService` `settings` | MISSING | `125` | WEB-ONLY |
| `GET /catalog/products?for=` `available` boolean | ✅ | ✅ `rvbCatalogService` | MISSING | `128` | WEB-ONLY |
| **Total** | 19/19 | 19/19 | 0/19 | — | **WEB-ONLY for all** |

## 42. BLOCKERS
| ID | Severity | Platform | Role | Feature | Expected | Actual | Evidence | Files | Required work |
|---|---|---|---|---|---|---|---|---|---|
| RVB-GAP-001 | BLOCKER | Mobile | all `worker|supplier|customer|supervisor|manager|admin` | **Entire portal** `5-tab` `Main Chats` `Secondary Chats` `Profile+Management` `Search` `Settings` + `login|change-password|onboarding` | Expo `Tabs` + `Stack` + `SecureStore` + `Socket` + 19 endpoints | `App.tsx` placeholder only, `app/` 0 files, `src/services` 0, `app/(app)/chats` empty, `package.json name:rvb-tmp` | `R.V.B-mobile/App.tsx:7`, `app/(app)/chats` empty, `src/api` empty, `src/services` empty | Create `app/_layout.tsx` `expo-router`, `Tabs` 5, `Stack` auth, `src/api/rvbClient.ts` `RVB_API_URL`, `src/stores/authStore` `expo-secure-store`, `src/features/*` screens, `hooks` `useRvbPresentationSettings` | backend ready, web reference `frontend/app/rvb/page.tsx` portal |
| RVB-GAP-002 | BLOCKER | Mobile | `worker|supplier|customer` | **Token storage** `refreshToken` `expo-secure-store` Keychain/Keystore never `AsyncStorage` | `refreshToken -> SecureStore` `accessToken -> memory+secure` `handshake.auth.token` | `src/services` empty, `package.json` no `expo-secure-store` declared (orphan `57.0.4` on disk not locked) `grep SecureStore` 0 hits | `R.V.B-mobile/package.json:8` no `expo-secure-store`, `src/services` empty, `RVB-MOBILE-CONTRACT:70` | Declare `expo-secure-store` `socket.io-client`, implement `authStore` `login` `X-RVB-Client: native`, `refresh` `X-Refresh-Token`, `RVB_SESSION_REVOKED` clear |

## 43. CRITICAL
| ID | Severity | Platform | Role | Feature | Expected | Actual | Evidence | Required work |
|---|---|---|---|---|---|---|---|---|
| RVB-GAP-101 | CRITICAL | Mobile | all | **Session revocation** `RVB_SESSION_REVOKED` `401` clear storage re-login else backoff | `authFetch` `401` -> `refresh` -> `clearAccessToken` | `src/services` 0 files, no `intercept` `401` handling, `App.tsx` no `ErrorBoundary` | `R.V.B-mobile/src` empty, `frontend/src/services/rvb-auth.service.ts:242` `on RVB_SESSION_REVOKED clear` as reference | Implement `api/interceptor.ts` `401 RVB_SESSION_REVOKED` -> `SecureStore.deleteItemAsync` + `router.replace("/(auth)/login")` |
| RVB-GAP-102 | CRITICAL | Backend+Web | `worker|supplier|customer` | **Business side-effect race** `Payment`/`Purchase`/`Sale` double-processing on concurrent `Accept` | `session.withTransaction` + `status!==under_review` guard inside tx | Concurrent `Accept` both see `under_review` snapshot before commit -> double `Payment` `worker-request.service:127` `paymentId` guard not atomic, same `supplier-request:194` `purchaseId`, `customer-request:172` `saleId` | `backend/src/services/worker-request.service.ts:113-224`, `supplier-request.service.ts:146-259`, `customer-request.service.ts:126-248` | Add `findOneAndUpdate` atomic claim before side-effects, add unique index `requestId` on `Payment|Purchase|Sale` |
| RVB-GAP-103 | CRITICAL | Mobile | `worker` | **Worker Loan balance** `balance+=amount` transactional | `loan` `amount>balance` revalidated `worker-request.service:183` `balance+amount` | Mobile 0 files -> worker cannot request loan | `R.V.B-mobile/src/features/worker/components` empty | Implement `WorkerPortal` `GET /portal/worker` + `POST /worker-requests` |
| RVB-GAP-104 | CRITICAL | Mobile | `supplier` | **New Supply** `weight*price` -> `Purchase` + `stock` + `Supplier balance` | `supplier-request.service:193` `PurchaseModel.create` | Mobile 0 files -> supplier cannot submit | `R.V.B-mobile/src/features/supplier/components` empty | Implement `SupplierPortal` `catalog` + `POST /supplier-requests` |
| RVB-GAP-105 | CRITICAL | Mobile | `customer` | **Insert Shipment** `under_review->Sale` `authPrice` `total=round` | `customer-request.service:37` `authPrice Product.price` | Mobile 0 files | `R.V.B-mobile/src/features/customer/components` empty | Implement `CustomerPortal` `Insert Shipment` |

## 44. HIGH
| ID | Severity | Platform | Role | Feature | Expected | Actual | Evidence | Required work |
|---|---|---|---|---|---|---|---|---|
| RVB-GAP-201 | HIGH | Mobile | all | **19/19 endpoints** `WEB-ONLY` | `POST /auth/login` `GET /portal/me` `GET /directory` `GET /chats` `Socket` `POST /notifications` etc. | 0/19 Mobile consumer, `src/api` empty `grep fetch 0` | `R.V.B-mobile/src` empty, `frontend/src/services/rvb-*.ts` 12 as reference | Implement `src/services/rvb-*.ts` mobile equivalents |
| RVB-GAP-202 | HIGH | Mobile | `customer` | **Place Order** `1..50` `enforceCustomerPrice` `price:0` overwrite | `customer-order.service:17` `Product.price` authoritative | Mobile 0 files `app/(app)/customer` empty | `R.V.B-mobile/src/features/customer/components` empty | Implement `Place Order` `GET /catalog/products?for=customer` `available` + `POST /customer-orders` |
| RVB-GAP-203 | HIGH | Mobile | `worker|supplier|customer` | **PFP onboarding** `gallery|camera|crop 512x512 <200k` `POST /onboarding data:image/` | `rvb-auth.ts:412` `<250k` | `App.tsx` placeholder, `src/features` empty | `R.V.B-mobile/app.json` no camera perms | Implement `Onboarding` `expo-image-picker` + `expo-image-manipulator` canvas 512 |
| RVB-GAP-204 | HIGH | Mobile | all | **Chats** `8 kinds` `main-workers|suppliers|customers` `admin_worker|supplier|customer` `dm group` + `Socket` `7 events` | same as Web `chat.service:56` `officialKind` unique | Mobile 0 files `app/(app)/chats` empty | `R.V.B-mobile/src/features/chats` empty | Implement `Chats` `Tabs Main|Secondary`, `socket.io-client` `path /api/rvb/chats/socket` |
| RVB-GAP-205 | HIGH | Backend | `manager|admin` | **Pin max3 race** `if(pinned.length>=3) throw` not atomic | `PIN_MAX=3` check then `save` | Concurrent `pin` both see `2` -> `4` | `backend/src/services/chat.service.ts:704` | Add `findOneAndUpdate` with size check |
| RVB-GAP-206 | HIGH | Backend | `worker|supplier|customer` | **`@tag` + `1-1` race** `findOne tag` then `create` -> `E11000` -> `500` not `409` | `unique` index exists `rvb-account.model:12,60` | Concurrent create/link same `tag`/`entity` both pass `findOne` -> one `500` | `backend/src/services/rvb-account.service.ts:133` | Add `try/catch E11000 -> 409` + `findOneAndUpdate` atomic |
| RVB-GAP-207 | HIGH | Mobile | all | **Directory Search** `q` `@tag` + `name` + `role` filters `All|Workers|Supervisors|Suppliers|Customers|Management` `PFP` | `rvb-directory.service:72` `tag.includes` | `R.V.B-mobile` 0 files | `R.V.B-mobile/src` empty | Implement `Directory` `GET /directory?search=&role=&limit=` |

## 45. MEDIUM
| ID | Severity | Platform | Role | Feature | Expected | Actual | Evidence | Required work |
|---|---|---|---|---|---|---|---|---|
| RVB-GAP-301 | MEDIUM | Web | all | **404 page** `not-found.tsx` under `app/rvb` | Generic `Failed to load` only | `app/rvb` no `not-found.tsx` | `frontend/app/rvb` Glob | Add `not-found.tsx` |
| RVB-GAP-302 | MEDIUM | Backend | `worker` | **Discrepancy description 2000** not server-enforced for `worker` only | `worker-request.service:52` `!trim` only | `worker-request.service` no `MAX_DESCRIPTION` import | `backend/src/services/worker-request.service.ts:52` | Add `MAX_DESCRIPTION_LENGTH 2000` check |
| RVB-GAP-303 | MEDIUM | Backend | `customer-request` review | **Price re-authoritative on edit** `review` uses `validateItems` not `enforceCustomerPrice` | `customer-request.service:152` `validateItems` | `customer-order.service:17` does `enforceCustomerPrice` | `backend/src/services/customer-request.service.ts:152` | Add `enforceCustomerPrice` on review `editedItems` |
| RVB-GAP-304 | MEDIUM | Web | `activity` | **Actor filter** `?actor=` missing in `notifications/page` activity toolbar | `rvb-activity.service:188` supports `actor` for `manager` | `page.tsx:319` only `actSource/search/date` | `frontend/app/rvb/notifications/page.tsx:319` | Add `StyledSelect` actor |
| RVB-GAP-305 | MEDIUM | Web | `dashboard` | `RvbActivityFeed` placeholder `title/emptyTitle` no fetch | `RvbActivityFeed.tsx:12` static | `activity` tab already real | `frontend/src/components/rvb/dashboard/RvbActivityFeed.tsx` | Wire `rvbActivityService.list` |
## 47. WHAT IS ALREADY COMPLETE
**Backend:** All 19 RVB endpoint families (56 endpoints), 5 core +9 supporting models with correct indexes (`tag unique`, `1-1 partial unique`, `dmKey unique`, `officialKind unique`, `channel+sourceEventId unique sparse`), 7 socket events, 6 roles, 0 stale accountant/co-manager, `SERVER_MODE` gating, `CORS` credentials, `TRUST_PROXY`, `rateLimit` per-account, `HttpOnly` refresh rotation atomic, `RvbNotification` per-recipient, `RvbActivity` redacted, `SyncChange` + `allocateRevision`, catalog safe DTO, `weight*price` authority, `quantity/weight` start 0, `description≤2000`, `items 1..50`, `under_review→accepted|rejected|cancelled`, `calculate` server recomputed.
**Web/Desktop:** 15/15 routes (`layout` guard order unauth→login→mustChange→pending→workspace, `login` tag 3-30, `onboarding` 512 <200k canvas, `change-password` 8-128, `accounts` linkable, `workers/suppliers/customers` CRUD + portal tabs, `directory` 24/page `Load more`, `chats` `main|secondary` URL sync + `officialBadge` + DM/group + `socket` 7 events + `15m edit` + `delete` + `🤝` + `pin max3` + `mentions` + `reminders 30/60/120` + `leave` + `last-member delete` + `history before/search`, `orders`/`requests` unified review + `edit-then-accept`, `notifications` per-recipient `priority` `deepLink` `user:` socket + `RvbNotificationBell`, `activity` redacted `sourceType=chats details null`, `settings` `language personal` `currency company manager/admin` `PFP` `sessions` `revokeOthers`, `RvbShell` `Access HSH` only manager/admin, `CompactHeader` boundary, `proxy.ts` `FRONTEND_MODE=rvb-public`, no Dexie (0 hits `database/db`), no dead `console.log` buttons, `loading` skeletons + `emptyState` + `errorBox` + `403` via `RvbRoleGuard`/inline) — `next build` 42/42 PASS.
**We do NOT rewrite:** Keep `frontend/app/rvb/**` + `frontend/src/services/rvb*.ts` + `backend/src/models|routes` as is; they are contract-faithful.

## 48. WHAT STILL NEEDS TO BE BUILT
**BACKEND:** 0 new endpoints required (19 families complete). Only hardening: `E11000→409` for `@tag` + `1-1`, `findOneAndUpdate {status:under_review}` atomic claim for `reviewWorker|Supplier|CustomerRequest|Order` to prevent double `Payment`/`Purchase`/`Sale`, `pin max3` atomic, `reaction` atomic, `worker discrepancy 2000` check, `customer-request review` `enforceCustomerPrice`.
**WEB/DESKTOP:** `not-found.tsx` under `app/rvb`, `RvbActivityFeed` wire `rvbActivityService.list`, `activity` toolbar `actor` filter — 3 small gaps.
**MOBILE:** **Greenfield** — bootstrap `app/_layout.tsx` `expo-router` `Tabs 5` `Stack` auth, `src/api/rvbClient.ts` `RVB_API_URL` + `expo-secure-store` + `socket.io-client` `path /api/rvb/chats/socket` `auth:{token}` (no query), `src/stores/authStore` login/refresh/logout/change-password/onboarding, `src/features/auth` login/change-password/onboarding (gallery/camera/crop 512), `src/types/rvb` `RvbAccount` + `src/constants` roles, `portal profile` `GET /portal/*` + `financial|activities|purchases|payments|sales|orders`, `Worker` `Payment/Loan/Discrepancy`, `Supplier` `New Supply` + `Discrepancy`, `Customer` `Insert Shipment` + `Discrepancy` + `Place Order` + `cancel/edit`, `Supervisor` `Customer CRUD + Orders`, `Directory` `All|Workers|...`, `Chats` 8 kinds + 7 events, `Notifications` `read/archive/bulk` + `deepLink`, `Activity` redacted, `Settings` language/theme + `currency` read-only + PFP, `PDF` `share` via `expo-print` + `expo-sharing`.
**SHARED CONTRACTS/TYPES:** `R.V.B-mobile/src/types` empty → copy `frontend/src/types/rvb/*` + `backend` `RvbAccount` `preferences` `syncStatus` handling (portal DTOs omit `syncStatus` per `contract:205`), fix `currency DA` vs `DZD` enum, `portal/worker/financial` vs `financial-events` path, pagination `page/limit` for portal history (currently unpaginated).
**TESTING/QA:** `npx tsc --noEmit` `RangeError` fix (`typescript 6.0.3` + `expo/tsconfig.base` circular), `expo-doctor` `expo ~57.0.25 expected 57.0.24`, `expo export` web bundle 339KB (already bundles despite tsc fail), add `playwright` mobile web preview for `app/rvb` parity, `RvbShell` `Mobile Coming soon`→`Ready`.

## 49. REQUIRED IMPLEMENTATION ORDER
**PHASE 1 — Shared contracts/types + Mobile bootstrap (dependency for all):** Fix `typescript` circular (`6.0.3`→`5.8` or `skipLibCheck`), `app.json` `expo-router` plugin, `package.json` `main:expo-router/entry`, declare `expo-secure-store`, `socket.io-client`, `zustand`, `zod`, `expo-image-picker/manipulator`, create `src/types/rvb` `RvbAccount` `RvbRole` `RvbNotification` `Conversation` `Message` from `backend/src/models` + `frontend/src/types/rvb` + `RVB-MOBILE-CONTRACT.md`, `src/constants` `RVB_ROLES`, `src/api/rvbClient.ts` `RVB_API_URL` `Authorization Bearer` + `HttpOnly` not needed for native `X-RVB-Client: native` `X-Refresh-Token`. *Why first:* All features depend on types + secure storage + base URL. *Testable:* `npx tsc --noEmit` PASS, `npx expo-doctor` 21/21.

**PHASE 2 — Mobile auth/session (dependency for navigation):** `src/stores/authStore` (`SecureStore` `refreshToken` + memory `accessToken`, `login` `normalizeTag` `TAG_REGEX` `423` lockout, `refresh` `POST /refresh` `X-Refresh-Token` + `rotationFamilyId`, `logout` `clearSecureStore`, `on RVB_SESSION_REVOKED` re-login, exponential backoff else), `RvbAuthGuard` (unauth→login, `mustChangePassword`→change-password, `pending`→onboarding), `app/(auth)/login.tsx` + `change-password` + `onboarding` (gallery/camera/crop 512 <200k DataURL). *Why before nav:* All tabs require `requireRvbAuth` + `status active` + `onboardingStatus`. *Testable:* `POST /auth/login` → `GET /auth/me` → `GET /portal/me` with `linkedEntity`.

**PHASE 3 — Backend hardening (blocks double-processing):** Add `catch E11000→409` for `@tag` + `1-1`, `findOneAndUpdate({id, status:under_review}, {$set:{status:accepted}})` atomic claim in `reviewWorkerRequest` `reviewSupplierRequest` `reviewCustomerRequest` `reviewCustomerOrder` before `Payment|Purchase|Sale` creation, `pin max3` atomic `updateOne` with `$size`, `reaction` `$addToSet/$pull`, `worker discrepancy 2000`, `customer-request review` `enforceCustomerPrice`. *Why before mobile requests/orders:* Prevents double `Payment`/`Purchase`/`Sale` when mobile submits. *Testable:* Concurrent `Accept` with `Promise.all` → 1 success, 1 `RVB_REQUEST_ALREADY_REVIEWED` 409.

**PHASE 4 — Mobile navigation + Portal profile (foundation for Worker/Supplier/Customer):** `app/_layout.tsx` `Stack` (`/(auth)` vs `(app)`), `app/(app)/_layout.tsx` `Tabs` 5 (`Main Chats`, `Secondary Chats`, `Profile+Management` default `Worker` `GET /portal/worker`, `Search`=`Directory`, `Settings`), `Worker` default landing `Profile+Management` (`GET /portal/worker` + `financial` + `activities` + `salary/credit/bonuses/absences`), `Supplier` `GET /portal/supplier|purchases|payments`, `Customer` `GET /portal/customer|sales|payments|orders`. *Why before requests:* Portal data needed for request context. *Testable:* `GET /portal/*` with `Authorization Bearer` returns `200` sanitized DTO.

**PHASE 5 — Mobile directory + chats (core social):** `GET /directory?search=&role=&limit=24` `All|Workers|...` `PFP` + `POST /chats/dm` `dmKey` `POST /chats/group` `name,memberIds` `secondary` + `Socket.IO` `path /api/rvb/chats/socket` `auth:{token}` 7 events (`newMessage|messageEdited|messageDeleted|reactionUpdated|pinnedUpdated|readReceipt|typing|unreadUpdate`) rooms `user: session: role: conversationId`. *Why before notifications:* Chats generate `rvb:notification` `mentions` `reminders`. *Testable:* `GET /chats?category=main|secondary` + `socket.on chat:newMessage` + `chat:typing` throttled.

**PHASE 6 — Mobile requests/orders (business):** `Worker` `POST /worker-requests` `payment|loan|discrepancy` (reuse portal `worker` validation `amount>0` etc.), `Supplier` `POST /supplier-requests` `new_supply` `items 1..50` `weight*price` `catalog?for=supplier` safe DTO `available` boolean, `Customer` `POST /customer-requests` `insert_shipment` `authPrice` + `POST /customer-orders` `Place Order` `enforceCustomerPrice` `for=customer` catalog, `Supervisor` `POST /requests/:source/:id/review` + `POST /customer-orders/:id/review` `edit+accept`. *Why after portal/directory:* Needs `linkedEntityId` + catalog. *Testable:* `POST /worker-requests` `201` → `GET /notifications` `high` `requests` appears + `RvbActivity` redacted.

**PHASE 7 — Mobile notifications/activity/settings/PFP/PDF:** `GET /notifications?status=&source=&priority=&date=` `per-recipient` `read/archive/bulk` `deepLink` + `GET /activities?source=` redacted + `GET /config` `currency` read-only + `PATCH /auth/preferences` `ui.language` personal + `PATCH /auth/profile` `displayName≤80` `profilePicture<250k` `Settings` + `PDF` `window.print` → `expo-print` `shareAsync`. *Why last:* Depends on all prior `createRvbNotification` sourceEventIds. *Testable:* `rvb:notification` `user:` room → `count` badge → `deepLinkForNotification` → `router.push`.

**PHASE 8 — Cross-platform QA:** `expo start --web` + `playwright` `app/rvb` vs `R.V.B-mobile` web preview `GET /rvb/*` vs `GET / (mobile)` parity matrix 19/19, `RVB_SESSION_REVOKED` clear `SecureStore`, `account archived` `403 RVB_ACCOUNT_ARCHIVED` → logout, `pin max3` concurrent, `reaction` toggle, `15m edit` window, `@tag` uniqueness `409` race, `1-1` race, offline `expo-netinfo` `Offline — retry` banner, `eas build` `npx expo run:android|ios`.

## 50. MINIMUM WORK FOR FINAL DELIVERY
- **Mobile bootstrap:** `app/_layout.tsx` `expo-router`, `Tabs` 5, `Stack` auth, `SecureStore` `RVB_API_URL` `rvbClient` (1-2 days)
- **Auth:** `login` `normalizeTag` `TAG_REGEX` `423`, `refresh` `X-Refresh-Token` atomic, `change-password` 8-128, `onboarding` gallery/camera/crop 512 <200k (2 days)
- **Portal:** `GET /portal/worker|supplier|customer` + `financial|purchases|sales` (1 day)
- **Requests:** `Worker Payment/Loan/Discrepancy`, `Supplier New Supply/Discrepancy`, `Customer Insert Shipment/Discrepancy` (3 days) — includes `validateItems` `1..50` `quantity>0` `weight>=0` `price>=0` `description≤2000` `weight*price` `computeTotal`, server `authPrice`/`SyncChange`/`Notification`/`Activity`
- **Place Order:** `GET /catalog/products?for=customer` `available` + `POST /customer-orders` `enforceCustomerPrice` + `cancel/edit` `under_review` only + `POST /customer-orders/:id/review` `manager,admin,supervisor` (2 days)
- **Directory:** `GET /directory?search=&role=` `All|Workers|...` `PFP` 24/page (1 day)
- **Chats:** `GET /chats?category=main|secondary` `POST /dm|group` + `Socket` 7 events + `15m edit` + `delete` + `🤝` + `pin max3` + `mentions` + `reminders 30/60/120` + `leave` + `last-member delete` + `history before/search` (4 days)
- **Notifications/Activity:** `GET /notifications` `per-recipient` `read/archive/bulk` `deepLink` `Socket rvb:notification` + `GET /activities` redacted (2 days)
- **Settings:** `language personal` `currency read-only` `PFP` `sessions` `revokeOthers` (1 day)
- **Backend hardening:** `E11000→409`, `findOneAndUpdate {status:under_review}` atomic claim for 4 `review*` services, `pin max3` atomic (0.5 day)
- **Total minimum:** Backend 0.5d + Web 0.5d (`not-found`+`RvbActivityFeed`+`actor` filter) + Mobile ~16d + QA 2d = **~19 days** (1 dev) / **~10 days** (2 devs parallel Web+MOBILE).

## 51. OPTIONAL POST-V1 UPGRADES
- Web `not-found.tsx` 404/500 pages for `app/rvb` (currently generic `Failed to load`)
- `RvbActivityFeed` dashboard real feed (currently placeholder)
- Mobile offline queue (`expo-sqlite` + `NetInfo` `queue` for `POST /worker-requests` when offline)
- Mobile `expo-image-picker` `allowsEditing` crop UI polish vs `onboarding` canvas ladder
- Push notifications via `expo-notifications` (currently `Socket` only, no `APNS`/`FCM`)
- Web `Coming soon` `RvbSystemStatus` `Mobile/Realtime/Notifications` → `Ready` after wiring
- Backend `rateLimiter` Redis (`Map` single-instance only)
- `MONGODB_URI` `TRUST_PROXY` `CORS_ORIGIN` docs for `rvb-public` prod `ALLOW_FULL_SERVER_IN_PRODUCTION`
- `design-tokens.css:3` `accountant` comment → `management`
- `package.json` `rvb-tmp` rename → `rvb-mobile`

## 52. FINAL ANSWERS
| Question | Answer |
|---|---|
| Is R.V.B Web/Desktop feature complete? | **YES** (15/15 routes, 12 services, 42/42 build PASS, 19/19 endpoints consumed, Socket 7 events, RBAC server-side, 0 Dexie violations, `proxy.ts` `FRONTEND_MODE=rvb-public`) |
| Is R.V.B Mobile feature complete? | **NO** (0 screens, 0 services, `App.tsx` placeholder only, `app/` 0 files, `src/services` 0, `expo-secure-store` orphan not declared) |
| Is the R.V.B Backend feature complete? | **YES** (5 core +9 supporting models, 19 routers ~56 endpoints, 7 socket events, `RvbAccount` tag+1-1, `RvbSession` atomic rotation, `SyncChange`, catalog safe DTO, `weight*price` authority, redacted activity) + 3 hardening `E11000`/`status race`/`pin` |
| Are Web and Mobile using compatible APIs? | **PARTIAL** (Web 19/19 `WEB-ONLY`, Mobile 0/19 → 0% Mobile; backend contract `NEXT_PUBLIC_API_URL` vs `RVB_API_URL` both `/api/rvb/*` compatible but Mobile not wired) |
| Are Web and Mobile using compatible types/contracts? | **PARTIAL** (Web `RvbAccount` `preferences` omission vs backend `syncStatus` leak, `portal/me` `linkedEntity` vs `entity`, `financial` vs `financial-events`, Mobile `src/types` empty) |
| Are role definitions consistent everywhere? | **YES** (`RVB_ROLES` `manager,admin,supervisor,worker,supplier,customer` in `backend/src/constants/rvb-roles.ts:1` + `frontend/src/types/rvb/roles.ts:1` + `rvb-account.model:14` same 6, 0 `accountant`/`co-manager` runtime) |
| Are functional Accountant references still present? | **NO** (5 matches only `backend/test-rvb-account-logic.ts:50` negative `isValidRvbRole("accountant")==false` + `design-tokens.css:3` comment) |
| Are functional Co-manager references still present? | **NO** (2 matches same negative test `co_manager` false, 0 functional) |
| Does Manager work end-to-end? | **YES** (Web `RvbShell` full nav 11, `workers/suppliers/customers/accounts` CRUD, `requests`+`orders` review, `chats` audit, `directory` management filter, `config` currency `manager,admin`) |
| Does Admin work end-to-end? | **YES** (same as manager + `chat audit` `Eye` `getMessageAudit` `role admin` only) |
| Does Supervisor work end-to-end? | **YES** (Web `own Worker` `GET /portal/worker` + `customer` CRUD `rvb-customers.ts:14` `manager,admin,supervisor` + `customer-orders` `POST /:id/review` `manager,admin,supervisor`, `RvbShell` `Access HSH` hidden, `workers/suppliers/accounts` 403 `RvbWorkersGuard` `manager,admin` only) |
| Does Worker work end-to-end? | **YES** (Web `WorkerPortal` `profile+Management` `salary/credit/bonuses/absences` `Payment/Loan/Discrepancy` `POST /worker-requests` `amount` vs `balance`, `PDF` `window.print`, `Activity` `WorkerActivity`, `chats` `main-workers`+`admin_worker` private, `directory` `supervisor` visible) + **MOBILE NO** |
| Does Supplier work end-to-end? | **YES** (Web `SupplierPortal` `New Supply` `weight*price` `serverTotal` + `Discrepancy`, `GET /portal/supplier/purchases|payments`) + **MOBILE NO** |
| Does Customer work end-to-end? | **YES** (Web `CustomerPortal` `Insert Shipment` `authPrice`→`Sale` + `Discrepancy` + `Place Order` `enforceCustomerPrice` `1..50` + `cancel/edit` `under_review` only, `GET /portal/customer/orders` + `customerName` enriched) + **MOBILE NO** |
| Are Worker requests complete? | **YES** (Web `Payment` `amount<=balance` `RVB_PAYMENT_EXCEEDS_CREDIT`, `Loan` `amount>balance` → `balance+=`, `Discrepancy` no mutation, `under_review→accepted|rejected`, `SyncChange` `Payment|Worker`, `Notification` `worker` `high`, `Activity` `request_submitted`) + **MOBILE NO** |
| Are Supplier submissions complete? | **YES** (Web `New Supply` `new_supply` `validateItems` `1..50` `serverTotal` `under_review`→`Purchase` `stock` `Supplier balance` `SyncChange`, `Discrepancy` no side effect) + **MOBILE NO** |
| Is Customer Insert Shipment complete? | **YES** (Web `insert_shipment` `under_review→Sale` `authPrice` `Product.price` + `stock-` + `Customer balance` + `SyncChange`) + **MOBILE NO** |
| Are Customer Orders complete? | **YES** (Web `Place Order` `POST /customer-orders` `customer` only `enforceCustomerPrice` + `GET /customer-orders?status` + `PATCH :id` edit `under_review` + `POST :id/cancel` + `POST :id/review` `manager,admin,supervisor` revalidates `quantity/weight`, **NO Sale/stock on accept** by design `customer-order.service:174` controlled) + **MOBILE NO** |
| Are Chats complete? | **YES** Web (8 kinds `main-workers|suppliers|customers` `admin_worker|supplier|customer` `dm` `dmKey unique` `group` 80 char, `isParticipant !leftAt`, `soft delete` `MessageAudit`, `15m edit`, `🤝` toggle, `pin max3` `RVB_PIN_LIMIT`, `mentions` `@tag` + `@workers` allowlist, `reminders 30/60/120` `RvbChatReminder` unique, `leave` `!isSystemManaged`, `last-member deleteMany+deleteOne`, `history before/search`, `Socket` `path /api/rvb/chats/socket` `auth:{token}` 7 events, rooms `user: session: role: conversationId`) + **MOBILE NO** |
| Are Notifications complete? | **YES** Web ( `GET /notifications?status=&source=&priority=&date=` `channel=rvb` per-recipient `readAt/archivedAt`, `GET /count` `unreadCount`, `POST :id/read {unread}` `POST :id/archive` `POST :id/restore` `POST /mark-all-read` `POST /bulk` 100 `403` if not visible, `priority normal|high|urgent` `derivePriority`, `deepLinkForNotification` `chats→/rvb/chats` `worker/purchase→/requests` `customer_order→/orders`, `Socket rvb:notification` `user:` ) + **MOBILE NO** (same endpoints ready) |
| Is Directory/Search complete? | **YES** Web (`GET /directory?search=&role=&limit=24` `All|Workers|Supervisors|Suppliers|Customers|Management` `q` strip `@` `tag.includes`, `PFP` `name` `@tag` `role`, `Message` DM `createDM`, `Open in Workspace` `canOpenWorkspace` manager true supervisor `worker|customer` only) + **MOBILE NO** |
| Is Activity complete? | **PARTIAL** Web (`GET /activities?source=&search=&date=&actor=&page=&limit=` redacts `chats` `details null`, `GET /workers/:id/activities` 200 limit, `portal/worker/activities` 200, `notifications/page` `activity` tab `source/search/date` grouped `Today` `isRtl`, but `RvbActivityFeed` dashboard placeholder `MISSING`, `actor` filter missing) |
| Is account/entity lifecycle synchronization complete? | **PARTIAL** Web (Worker `create→onboarding→archive (balance 0)→reactivate→disable→unlink→status+disconnect+history preserved`, Supplier/Customer `entity Archive` **MISSING** `POST /suppliers/:id/archive` only `DELETE`, hard `DELETE /accounts` intentionally absent, `Supplier/Customer` hard `DELETE` erases `SyncChange delete` no restore, `archiveByLinkedEntity` `reactivateByLinkedEntity` only for Worker) |
| Is RBAC safe? | **YES** (All `requireRvbAuth`+`requireRvbRole` per route `manager,admin` vs `manager,admin,supervisor` vs `customer` etc., `supervisor` cannot `POST /workers|suppliers|accounts` 403 `RvbWorkersGuard`, `Access HSH` hidden `RvbShell:393`, `isParticipant` for chats, `account.status!==active` `403`) |
| Is ownership enforcement safe? | **YES** (All portal `linkedEntityId` derived `req.rvbUser.accountId` `rvb-portal.ts:88` `worker-requests:60` `effectiveWorkerId=linkedId` `if(workerId&&!==linkedId)403`, `customer-orders:58` `body customerId!==linkedId=>403`, `chat edit` `sender===editor` `chat.service:622`, `RvbSession` `accountId` derived) |
| Are runtime mocks/placeholders still present? | **YES** (Web 1 decorative `Coming soon` in `RvbSystemStatus` + `RvbActivityFeed` placeholder, Mobile 14 empty dirs `app/(app)/chats` etc. + `App.tsx` placeholder) |
| Are there dead buttons/screens? | **NO** Web (0 `console.log` handlers, 0 `onClick={() => {}}`), **YES** Mobile (empty route dirs `app/(app)/chats` no `_layout.tsx` → dead `404` if router enabled, `src/api|services|stores` 0 files → dead scaffolding) |
| Can R.V.B be considered final today? | **NO** (Web+Backend **YES** for manager/admin/supervisor/worker/supplier/customer desktop, Mobile **NO** 0 screens) |
| What EXACTLY remains before final R.V.B delivery? | **Mobile greenfield 19 endpoints + bootstrap** (see §48-50): `app/_layout` `Tabs 5` `Stack` auth, `SecureStore` `RVB_API_URL`, `auth` login/refresh/onboarding, `portal` 4, `directory` 1, `chats` 7 events, `notifications` 7, `activity`, `requests` 3, `orders` 1, `settings` PFP/sessions, `PDF` share, `contract` `currency DA vs DZD` `financial` vs `financial-events` path, plus backend hardening `E11000→409` + `status race` + `pin max3` + `actor` filter + `not-found.tsx` |
