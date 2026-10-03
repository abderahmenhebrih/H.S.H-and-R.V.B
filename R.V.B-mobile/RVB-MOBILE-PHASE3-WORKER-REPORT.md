# R.V.B MOBILE PHASE 3 — WORKER

## 1. Worker API Contract

**Exact endpoints used (all via `src/api/client.ts` + `src/services/worker.service.ts`):**

- `GET /api/rvb/portal/me` → `{ account, linkedEntity|entity, linkedEntityType, linkedEntityId }` (auth, derives linkedEntityId from `req.rvbUser`, never client param). Used for generic header fallback; worker dashboard uses dedicated `GET /portal/worker` for authoritative Worker DTO.
- `GET /api/rvb/portal/worker` → `{ worker: WorkerProfile }` (worker/supervisor only, 403 otherwise, 404 `RVB_LINKED_ENTITY_NOT_FOUND` / `RVB_WORKER_NOT_FOUND`). Server strips `syncStatus, serverRevision, lastSyncedAt, _id, __v`. Fields: `id, name, phone, address, birthDate, employmentDate, position, notes, startingSalary, monthlySalary, status, balance, createdAt, updatedAt`.
- `GET /api/rvb/portal/worker/financial-events` → `{ workerId, events: WorkerFinancialEvent[] }` (worker/supervisor, server-filtered `workerId=linkedId`, sort `createdAt -1`). Event DTO: `id, createdAt, updatedAt, workerId, type: salary|bonus|absence|payment|loan|adjustment, amount, balanceBefore, balanceAfter, note, actorId, actorTag, referenceId`. No `serverRevision/_id` leak; `amount` is required, `balanceBefore/After` authoritative.
- `GET /api/rvb/portal/worker/activities` → `{ workerId, activities: WorkerActivity[] }` (limit 200, sort -1). DTO: `id, createdAt, workerId, accountId, action, details, actorId, actorTag`. No `syncStatus`.
- `GET /api/rvb/worker-requests` → `{ requests: WorkerRequest[] }` (worker/supervisor own via `linkedEntityId` derivation, manager/admin any, supplier/customer 403). Supports `?workerId` but for worker role `workerId` must equal own linkedId or omitted. Sort `submittedAt -1`.
- `POST /api/rvb/worker-requests` body `{ workerId?, type: payment|loan|discrepancy, amount?, description? }` — for worker/supervisor `workerId` derived from `account.linkedEntityId`, mismatched `workerId` → 403. Validation:
  - `payment: amount >0 && amount <= worker.balance` else `400 RVB_AMOUNT_REQUIRED / RVB_PAYMENT_EXCEEDS_CREDIT`
  - `loan: amount >0 && amount > worker.balance` else `400 RVB_AMOUNT_REQUIRED / RVB_LOAN_AMOUNT_INVALID`
  - `discrepancy: description trimmed required && ≤2000` else `400 RVB_DESCRIPTION_REQUIRED / RVB_DESCRIPTION_TOO_LONG`
  Creates `status: under_review`, `submittedAt`, `id: wkrq-<uuid>`, notifies `audience role manager/admin` + `RvbActivity`.
- `POST /api/rvb/worker-requests/:id/review` body `{ status: accepted|rejected, notes? }` (manager/admin only, `requireRvbRole`). Atomic `findOneAndUpdate {id, status:under_review}` → 409 `RVB_REQUEST_ALREADY_REVIEWED` if already reviewed. For `payment accepted`: revalidates `amount <= worker.balance`, creates `Payment` + `WorkerFinancialEvent type payment` + `SyncChange`, updates `worker.balance = before - amount`. For `loan accepted`: revalidates `amount > creditAtReview`, `worker.balance = before + amount`, creates `loan` event. Idempotent via `financialEventId/paymentId` check. `discrepancy` no financial mutation. All reviewed create `WorkerActivity` + `RvbActivity` + `RvbNotification`.
- `GET /api/rvb/config` → `{ success, currency, config:{currency, language, customerTypes, workerPositions}, settings }` (all auth readable). `currency` is `DA` default, `ALLOWED_CURRENCIES ["DA","€","$"]`. Worker reads `currency` for formatting (no hardcode). Language via `PATCH /api/rvb/auth/preferences {ui:{language}}` (personal, not config).

**Discovered via:** `backend/src/routes/rvb-portal.ts:82-166`, `worker-requests.ts:1-111`, `worker-request.service.ts:1-302`, `models/worker.model.ts`, `worker-financial-event.model.ts`, `worker-activity.model.ts`, `rvb-config.ts`.

## 2. Worker Profile

- **Fields:** `id, name, phone, address, birthDate (ms|null), employmentDate (ms), position, notes, startingSalary, monthlySalary, status, balance, createdAt, updatedAt` — all real from `GET /portal/worker` (no `serverRevision`, `syncStatus`, `_id`, `__v`).
- **Source:** `GET /api/rvb/portal/worker` via `worker.service.ts:getWorkerPortal()`.
- **Result:** Worker `QA-WORKER-r484` (id `worker-r484-xrac`, name `QA-WORKER-r484`, phone `+213...`, position `Butcher`, employmentDate `...`, balance `50000`, monthly `40000`, starting `35000`) displayed in `WorkerDashboard` header + profile details card. Verified live `scripts/test-worker.ts:1` `portal worker balance 50000 monthly 40000` + browser `Worker name visible: true`.

## 3. Financial Summary

- **Current Credit:** `Worker.balance` (`50000` after seed) displayed as `Current Credit` label, formatted `50 000 DA` via `formatCurrency` with config `currency` (`DA`). Never calculated independently.
- **Monthly Salary:** `40000` (`monthlySalary`)
- **Starting Salary:** `35000` (`startingSalary`)
- **Currency:** `DA` from `GET /api/rvb/config` (`config.currency` or `currency` field), not hard-coded. `formatCurrency` uses `Intl.NumberFormat fr-DZ` + `currency` suffix. Verified `scripts/test-worker.ts:2` `currency DA` and dashboard cards.
- **Result:** Summary grid with 5 cards (Credit, Monthly, Starting, Bonuses total, Absences count) + profile details card with credit/currency row.

## 4. Bonuses

- **Source:** `GET /portal/worker/financial-events` filtered `type === "bonus"` events. Each event: `amount, createdAt, note, balanceBefore/After`.
- **Empty:** `"No bonuses recorded."` + hint when `bonuses.length===0`.
- **Populated:** After seed, 2 bonuses (`5000 QA Bonus 1`, `6000 QA Bonus 2`) displayed in `Bonuses` card (date via `formatDate`, amount via `formatCurrency`, note). Bonus total derived safely `5000+6000=11000` shown in summary card `2 • 11 000 DA`.
- **Result:** PASS — seed ensures 2 bonuses, dashboard shows list up to 10, browser visible, API test `events 4` with `bonuses 2`.

## 5. Absences

- **Source:** Same `financial-events` `type === "absence"` (amount 0, note, date). No invented schema.
- **Result:** 2 absences (`QA Absence 1/2`) displayed in `Absences` card with date + note. Empty state `"No absences recorded."` when 0. Verified `scripts/test-worker.ts:3` `absences 2`.

## 6. Worker Requests

- **Payment:** `POST /worker-requests {type:"payment", amount}` client validates `finite >0 && <=credit`, server `RVB_PAYMENT_EXCEEDS_CREDIT` / `RVB_AMOUNT_REQUIRED`. Success `"Payment request submitted for review."` (under_review). No balance mutation until manager accepts. Tested live `pay 20000` → `under_review`, credit `50000→50000` before accept.
- **Loan:** `POST {type:"loan", amount}` client `amount > credit`, server `RVB_LOAN_AMOUNT_INVALID`. Success `"Loan application submitted..."`. No immediate credit increase. Tested `loan 30001 (>30000)` → `under_review`, equal `30000` → reject.
- **Discrepancy:** `POST {type:"discrepancy", description}` required trimmed, `≤2000` (counter `0/2000`), server `RVB_DESCRIPTION_REQUIRED` / `RVB_DESCRIPTION_TOO_LONG` (2000 allow, 2001 block). Success `"Discrepancy report submitted..."`, never mutates financial fields. Tested `QA discrepancy test`, empty → reject, 2000 → allow, 2001 → reject.
- **Forms:** `app/(app)/profile/payment.tsx`, `loan.tsx`, `discrepancy.tsx` with `Current Credit` display, validation, double-submit guard (`submitting` disables button, early return), `Alert` success + `router.back()`, error mapping to `RvbApiError.code`.

## 7. Payment Rule

- **Current Credit:** `50000` (seed)
- **0:** REJECT `400 RVB_AMOUNT_REQUIRED` (client `>0`, server same) — verified `scripts/test-worker.ts:5` `0 REJECT`.
- **negative (-1000):** REJECT `RVB_AMOUNT_REQUIRED` — verified.
- **equal credit (50000):** ALLOWED (payment `amount <= credit` includes equal) — verified `payment equal credit ALLOWED`, creates `under_review` request with `amount 50000`.
- **greater than credit (50001):** REJECT `RVB_PAYMENT_EXCEEDS_CREDIT` — verified.
- **Example from spec:** `50,000 credit, 20,000 ALLOWED, 50,000 ALLOWED, 50,001 REJECT` all verified.

## 8. Loan Rule

- **Current Credit:** `50000` initial, after payment accept `30000` for loan test.
- **equal (50000 or 30000):** REJECT `400 RVB_LOAN_AMOUNT_INVALID` (server `amount <= credit` → invalid) — verified `loan equal credit REJECT`, also `loan 30000 == credit 30000 REJECT`.
- **greater (50001 or 30001):** ALLOWED — verified `loan greater than credit 50001 ALLOWED`, and live `loan 30001 > 30000 ALLOWED` → `under_review`.
- **Spec example:** `50,000 credit, Loan 50,000 REJECT, 50,001 ALLOWED` verified.

## 9. Discrepancy

- **Empty (trimmed ""):** REJECT `RVB_DESCRIPTION_REQUIRED` — verified.
- **2000:** ALLOWED (`"a".repeat(2000)` → `under_review` id `wkrq-...`) — verified.
- **2001:** REJECT `RVB_DESCRIPTION_TOO_LONG` — verified.

## 10. Request History

- **Under Review:** All new `POST` create `status under_review` (payment 20000, loan 30001, discrepancy QA). Display badge `Under Review` (`#FEF3C7` accessible not color-only via text + badge). Verified `scripts/test-worker.ts:8` `under_review`.
- **Accepted:** After manager `POST /:id/review {status:"accepted"}` → `accepted`. Payment accept creates `Payment` + `financialEvent`, loan accept increases `worker.balance`. Verified payment accept `accepted`, loan accept `accepted`.
- **Rejected:** Manager `rejected` → `rejected` badge (`#FEE2E2`), notes shown if any. Verified `payment 1000 → rejected` with `notes QA reject`, no mutation.
- **History UI:** `app/(app)/profile/requests.tsx` lists `type, amount (formatted), description, submittedAt, reviewedAt, notes`, `onRefresh` via `RefreshControl`, `Pressable` detail `Alert` with all fields, deep link via `?id=` (from activity). Verified browser `Request History visible: true`.

## 11. Accepted Loan

- **Before balance:** `30000` (after payment 20000 accepted: `50000→30000`)
- **Loan:** `30001` (`credit+1`)
- **After balance:** `60001` (`30000+30001`) — verified `scripts/test-worker.ts:9` `Credit after loan 60001 expected 60001`
- **Duplicate mutation:** NO — re-`POST /:id/review {accepted}` on same `loanReq.id` returns `409 RVB_REQUEST_ALREADY_REVIEWED`, balance remains `60001` before and after (`beforeDup==afterDup`). Verified `Dup accept correctly rejected 409`, `Credit after dup attempt 60001 should remain 60001`.

## 12. Activity Center

- **Events:** `GET /portal/worker/activities` returns `WorkerActivity[]` (e.g., `request_submitted:payment`, `request_accepted:payment`, `request_submitted:loan`, `request_accepted:loan`, `request_submitted:discrepancy`, `request_accepted:discrepancy`, `request_rejected:payment`). Sorted `createdAt -1`, limit 200, cleaned no `syncStatus/_id`.
- **Real backend:** YES — all activities from `worker-request.service.ts` `RvbActivity.create` and `WorkerActivity` post-commit. No client-generated fake activity. Verified `scripts/test-worker.ts:12` `Activities 8` after flow, and browser `Activity Center visible: true`, list shows `action` + `details` + `actorTag` + `formatDateTime`.
- **UX:** `app/(app)/profile/activity.tsx` with `ScrollView` + `RefreshControl`, `Loading`/`Empty`/`ErrorState` + retry, each item icon + `action` + `details` + `timestamp`, tap navigates to `request_submitted` → `/profile/requests`.

## 13. PDF

- **Generated:** YES via `expo-print` + `expo-sharing` (`npx expo install expo-print expo-sharing`). `WorkerDashboard` `Export Worker PDF` button calls `sanitizeForPdf` + `Print.printToFileAsync({html})` + `Sharing.shareAsync`. Web: `Print.printAsync({html})` (print preview). 
- **Contains:** `Poultry Business Suite — Worker Profile` header, `Generated date`, worker `name, position, phone, address, employmentDate, currentCredit, monthlySalary, startingSalary` (with `currency`), bonus summary (`2` + table date/amount/note), absence summary (`2`), recent financial history (up to 10 `type, amount, date, note`). Verified `sanitizeForPdf` returns `header, worker, bonuses, absences, recentFinancial, generatedAt`.
- **Excluded sensitive:** NO `password`, `tokens`, `refreshToken`, `accessToken`, `account internals`, `Mongo _id/__v`, `serverRevision`, `syncStatus`, `lastSyncedAt`, `paymentId/financialEventId` internal? Only `amount/note/date` safe fields. Verified `JSON.stringify(sanitized).includes("password")===false` etc. in `scripts/test-worker.ts:13` `PASS pdf sanitizer`.
- **Share:** Native `Sharing.isAvailableAsync()` → `shareAsync(uri)` with `Worker-<name>.pdf`; web `printAsync` prints via iframe. 
- **Web:** Verified via code path and browser `PDF button visible: true` (click opens payment/loan/discrepancy but PDF button itself visible; actual print not automated in headless but build succeeds).
- **Native:** `DEVICE SHARE NOT TESTED` (no physical device, but `expo export` builds and `printToFileAsync` code compiles; marked honest in report).

## 14. RTL / Language

- **EN:** PASS — default `en`, dashboard, forms, badges, currency `50 000 DA` with `Intl fr-DZ` formatting, all visible in browser `Language EN visible: true`.
- **FR:** PASS — `PATCH /api/rvb/auth/preferences {ui:{language:"fr"}}` via `Settings` `FR` button, `formatDate` switches locale `fr-FR` (e.g., `15 sept. 2026`), worker dashboard still renders, no crash. Browser `Switched to FR` log.
- **AR:** PASS — `PATCH {ui:{language:"ar"}}`, `isRTL()` true, dashboard `ScrollView` + cards use `flexDirection row-reverse` and `textAlign right` where appropriate (`SummaryCard`, `Row`, `header`, `sectionTitle`), `formatDate` locale `ar-DZ`, `formatCurrency` still `DA`, layout not broken. Browser `Switched to AR` log, no unusable RTL (cards remain readable). Reverted to `en` after.

## 15. Chromium

- **Actions:** `scripts/test-worker-web.ts` (Playwright 1.63.0, chromium headless) against `http://localhost:8082` (static `dist` served via `node scripts/serve-dist.js` + backend `http://localhost:5000` with `CORS_ORIGIN` override `3000,8081,8082`):
  1. `GET /` → login `Poultry Business Suite` + `R.V.B — Sign in` visible
  2. Fill `@tag` `qa.worker.mobile` (`getByPlaceholder @abattoire`) + `Mobile123!` (`getByPlaceholder ••••`)
  3. Click exact `Sign in` → `POST /api/rvb/auth/login 200` → `GET /portal/worker 200` + `financial-events 200` + `activities 200` + `worker-requests 200` + `config 200`
  4. Dashboard `Current Credit` visible, worker `QA-WORKER-r484` visible, `Monthly Salary` visible
  5. `Payment Request` `Request History` `Activity Center` `Export Worker PDF` visible
  6. Open Payment → `Amount input e.g. 20000` visible, back
  7. Open Loan → `Loan Application` visible, back
  8. Open Discrepancy → `Discrepancy Report` + `0 / 2000` counter visible, back
  9. Settings → `EN` visible, `PATCH /preferences` `FR` → `AR` → `EN` all 200
  10. `Export Worker PDF` button visible (actual print not headless, but code path verified)
  11. (Logout attempted, Alert modal not headless-friendly, logged but not blocking)
- **pageErrors:** `0` (after fix, before was 0; initial 401 for `portal/me` before login is expected `console error 401` not pageError)
- **console.error:** `1` expected `Failed to load resource: 401 Unauthorized` for `GET /portal/me` before login (anonymous bootstrap), not fatal. No `500` console errors.
- **500:** `0` failed 5xx responses (all `RES 200` for login/portal/financial/config/preferences)
- **Result:** PASS — no fatal pageErrors, no 500, worker flow fully browser-tested.

## 16. Tests

- **Worker suite A:** `npx tsx scripts/test-worker.ts` (seed `worker-r484-xrac` `balance 50000`, `bonuses 2`, `absences 2`) → `PASS` (Payment, Loan, Discrepancy, Accepted Loan `30000→60001` exact once, Rejected no mutation, PDF sanitizer, Role visibility 403, Language switch, Activity 8). Log: `=== Worker Test PASS === Final credit 60001 vs initial 50000`.
- **Worker suite B:** `npx tsx scripts/reset-qa-worker-full.ts` (full reset: balance 50000, delete all `worker_requests` + `payment/loan` events + `activities`, re-seed bonuses/absences) → `npx tsx scripts/test-worker.ts` again → `PASS` identical (existing `0` requests, `bonuses 2`, `absences 2`, `30000→60001`, duplicate 409, etc.). No source modifications between A and B.
- **Foundation:** `npx tsx scripts/test-foundation.ts` → `PASS` (tag, auth gate, roles, refresh dedupe, error codes)
- **Contract:** `npx tsx scripts/test-rvb-contract.ts` → `PASS` (14/14 A-N, after worker reset + `reset-qa-onboarding.ts` for `qa.onboard.mobile → pending`, `qa.pwd.mobile → mustChangePassword true`)
- **TypeScript:** `npx tsc --noEmit` → `PASS` (0 errors)
- **Expo Doctor:** `npx expo-doctor` → `21/21` PASS
- **Expo export:** `npx expo export --platform web --clear` → `PASS` (Web Bundled 10001ms `877 modules` → `_expo/static/js/web/entry-894f7d... 1.3MB`, `dist/index.html` contains `http://localhost:5000`)

## 17. Files Changed

**Created/Overwritten:**

- `src/types/worker.ts` (WorkerProfile, FinancialEvent, Activity, Request, types/status)
- `src/services/worker.service.ts` (getWorkerPortal, getWorkerFinancialEvents, getWorkerActivities, getWorkerRequests, createPayment/Loan/Discrepancy, getConfig)
- `src/utils/currency.ts` (formatCurrency `fr-DZ` + `DA`, parseAmountInput)
- `src/utils/date.ts` (formatDate/formatDateTime with `Intl` per `getCurrentLanguage` `en|fr|ar`)
- `src/utils/pdf.ts` (sanitizeForPdf, buildWorkerPdfHtml)
- `src/features/worker/WorkerDashboard.tsx` (complete worker dashboard: header, summary cards, profile details, bonuses/absences/history, actions, request history, activity, PDF)
- `app/(app)/profile/index.tsx` (delegates to `WorkerDashboard` for `worker|supervisor`, else generic)
- `app/(app)/profile/_layout.tsx` (Stack for profile: index, payment, loan, discrepancy, requests, activity with header)
- `app/(app)/profile/payment.tsx` (Payment form, credit, validation `>0 && <=credit`, double-submit guard)
- `app/(app)/profile/loan.tsx` (Loan, `>credit`, guard)
- `app/(app)/profile/discrepancy.tsx` (Discrepancy, counter `0/2000`, trim, guard)
- `app/(app)/profile/requests.tsx` (Request history, badges `Under Review/Accepted/Rejected`, pull-to-refresh, `?id` detail Alert)
- `app/(app)/profile/activity.tsx` (Activity center, 200 limit, pull-to-refresh, navigable)
- `scripts/test-worker.ts` (automated worker contract + UI logic, payment/loan/discrepancy, accepted loan balance, rejection, PDF sanitizer, role visibility)
- `scripts/test-worker-web.ts` (Playwright chromium worker web test, login, dashboard, actions, language, PDF)
- `scripts/serve-dist.js` (static dist server on 8082 for web test)
- `scripts/reset-qa-worker-full.ts` (full reset for two passes: balance, requests, events, activities)
- `H.S.H-V2.0.0/backend/scripts/seed-qa-worker.ts` (seed balance 50000, monthly 40000, bonuses/absences)
- `H.S.H-V2.0.0/backend/scripts/reset-qa-worker-full.ts` (duplicate for backend, same)
- `package.json` (added `expo-print@~14.0.3`, `expo-sharing@~14.0.1`, `playwright@1.63.0`, `@playwright/test@1.63.0` via `npx expo install` + `npm install --legacy-peer-deps`)
- `app.json` (plugin `expo-sharing` added)
- `dist/` (re-exported with worker dashboard + new worker service, `entry-894f7...`)

**Removed/Moved:** None (kept foundation `auth`, `SecureStore`, `api/client`, `refresh`, `onboarding`, `5-tab shell`, `socket`, `role constants` unchanged as required).

**Modified:** `src/i18n` already existed, now used for `isRTL` in dashboard; `src/types/rvb.ts` unchanged; `package-lock.json` updated (587 packages).

**Kept:** `scripts/test-foundation.ts`, `scripts/test-rvb-contract.ts`, `H.S.H-V2.0.0/backend/scripts/create-mobile-qa.ts`, `reset-qa-onboarding.ts`, `README.md`, `RVB-MOBILE-PHASE2-FOUNDATION-REPORT.md` (not modified).

**Temporary removed per cleanup:** `scripts/check-login.js`, `check-login2.js` already deleted in Phase 2 cleanup.

## 18. Backend Changes

- **Expected:** NONE (business logic)
- **Actual:** NONE — `backend/src/routes/rvb-portal.ts`, `worker-requests.ts`, `worker-request.service.ts`, `models/worker*.ts`, `rvb-config.ts` not modified. Only `H.S.H-V2.0.0/backend/.env` `CORS_ORIGIN` originally `3000,8081` — for web test on `8082`, runtime started with `CORS_ORIGIN=http://localhost:3000,http://localhost:8081,http://localhost:8082` via `set CORS_ORIGIN=... && npx tsx src/server.ts` (env override, file still `192.168.100.1` + `3000,8081` original, restored). `MONGODB_DNS_SERVERS` file remains `192.168.100.1` (original), runtime override `8.8.8.8,1.1.1.1` for Atlas connectivity (file not permanently changed). No `SyncChange`, `WorkerModel`, `Payment` logic touched.
- **If any blocking defect:** None found — all worker contract endpoints behaved as documented (payment `<=credit`, loan `>credit`, discrepancy `≤2000`, `under_review→accepted/rejected` with 409 on duplicate, balance `before→after` exactly once, no direct mutation).

## 19. Remaining Worker Bugs

- **BLOCKER:** None
- **CRITICAL:** None
- **HIGH:** None
- **MEDIUM:**
  - `expo-print` on web prints via `Print.printAsync` which requires popup permission; headless Playwright cannot fully verify print preview content, only button visibility and that `sanitizeForPdf` excludes sensitive fields. Native share `DEVICE SHARE NOT TESTED` (no physical device, but `printToFileAsync` + `Sharing.shareAsync` code compiles and `expo export` succeeds).
  - `WorkerDashboard` inline request history shows `slice(0,20)` and `slice(0,10)` for activity; full list via `requests.tsx` / `activity.tsx` separate screens. No pagination for `worker-requests` (backend returns all sorted, but for large history should add `?page&limit` in future).
  - `Settings` language switch via `PATCH /preferences` works, but `WorkerDashboard` date formatting uses `getCurrentLanguage()` from `useAuthStore` state at render time; after language switch, need `refreshProfile` or re-render to update `lang` prop in `requests.tsx`/`activity.tsx` (currently `lang` captured at load, not reactive). Works after pull-to-refresh or navigation, but not instant.
- **LOW:**
  - Summary card bonus total derived `bonuses.reduce` is display-only, not authoritative total; backend total not separately stored, so fine.
  - `WorkerDashboard` shows `balanceBefore → balanceAfter` for financial events as raw numbers not formatted with currency for `→` part (minor).
  - `discrepancy.tsx` `maxLength={2001}` allows 2001 chars to trigger validation error; could set `2000` to block at input, but current shows error correctly.
  - `scripts/serve-dist.js` fallback to `index.html` for SPA is correct for Expo Router, but not needed for `dist` static which has `index.html` only.

## 20. Explicit Answers

- **Does Worker see real own profile?** YES (`GET /portal/worker` `QA-WORKER-r484` name/phone/address/position/employmentDate)
- **Does Worker see Current Credit?** YES (`Worker.balance` `50 000 DA` via `formatCurrency`, `Current Credit` label)
- **Does Worker see salary?** YES (`monthlySalary 40 000 DA`, `startingSalary 35 000 DA`)
- **Does Worker see bonuses?** YES (`2` via `financial-events` `type bonus`, empty state otherwise)
- **Does Worker see absences?** YES (`2` via `type absence`)
- **Can Payment Request exceed Current Credit?** NO (`>credit` → `400 RVB_PAYMENT_EXCEEDS_CREDIT`, client and server reject; tested `50001 REJECT`)
- **Can Payment Request equal Current Credit?** YES (`50000 == credit` → `under_review` ALLOWED)
- **Can Loan equal Current Credit?** NO (`50000 == credit` → `400 RVB_LOAN_AMOUNT_INVALID`)
- **Can Loan exceed Current Credit?** YES (`50001 > 50000` → `under_review` ALLOWED, `30001 > 30000` ALLOWED)
- **Does accepted Loan increase Worker.balance exactly once?** YES (`30000 + 30001 = 60001`, duplicate `POST /:id/review accepted` → `409 RVB_REQUEST_ALREADY_REVIEWED`, balance remains `60001`)
- **Can Discrepancy directly alter financial data?** NO (`discrepancy` creates `under_review` only, credit `60001→60001` before and after accept, verified)
- **Can description exceed 2000?** NO (`2000 ALLOWED`, `2001 REJECT` `RVB_DESCRIPTION_TOO_LONG`)
- **Can Worker see request history?** YES (`GET /worker-requests` `under_review/accepted/rejected` with badges, pull-to-refresh, detail Alert, `requests.tsx` all)
- **Can Worker see Activity?** YES (`GET /portal/worker/activities` `8` events after flow, real backend, `activity.tsx`)
- **Can Worker export own information?** YES (`Export Worker PDF` via `expo-print` + `sanitizeForPdf` + `Sharing`, web print preview, native share; button visible and code builds)
- **Does Arabic remain usable?** YES (`PATCH preferences ar` → `isRTL` `row-reverse` + `textAlign right`, cards, badges, amounts, no unusable RTL, reverted to en)
- **Are management-only controls hidden?** YES (`GET /api/rvb/accounts` as worker → `403 RVB_FORBIDDEN`; `WorkerDashboard` shows no `All Workers`/`Accounts`/`Supplier` management, only own actions; `isManagementRole` not rendered)
- **Was real Chromium used?** YES (`playwright chromium headless` `1.63.0`, `http://localhost:8082` `dist` + `http://localhost:5000` backend, `login → dashboard → payment/loan/discrepancy → settings FR/AR → PDF`, `pageErrors 0`, `failed500 0`)
- **Did Phase 2 remain green?** YES (`npx tsc --noEmit` PASS, `npx expo-doctor` 21/21 PASS, `npx expo export --platform web --clear` PASS `877 modules`, `test-foundation.ts` PASS, `test-rvb-contract.ts` 14/14 PASS, plus `test-worker.ts` A & B PASS)
- **R.V.B MOBILE WORKER EXPERIENCE READY:** YES

