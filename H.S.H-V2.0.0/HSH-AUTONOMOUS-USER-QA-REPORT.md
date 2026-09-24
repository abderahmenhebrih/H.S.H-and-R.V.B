# H.S.H AUTONOMOUS USER QA REPORT

**Date:** 2026-09-24T03:16:33.507Z
**Git commit:** 1536b35 024
**Browser:** chromium (Chromium)
**Playwright:** ^1.63.0
**Frontend:** http://localhost:3000
**Backend:** http://localhost:5000 (QA isolated MongoMemoryReplSet via backend/src/qa-server.ts)
**Duration:** unknown
**QA database:** MongoMemoryReplSet disposable (fresh per run), Dexie fake-indexeddb per browser context

## Summary

- **Total UI actions:** 28
- **Pages visited:** /, /products, /customers, /suppliers, /accounts, /purchases, /sales, /payments, /workers, /vehicles, /tasks, /reports, /invoice, /notifications, /settings, /office (16)
- **Records created:** 15
- **Records edited:** 1
- **Records deleted:** 0
- **Purchases performed:** 0
- **Sales performed:** 0
- **Payments performed:** 0
- **Tasks performed:** 1
- **Office files created:** 2
- **Page errors:** 0
- **Console errors (filtered):** 36
- **Request failed:** 0
- **HTTP errors (>=500):** 0

## CONFIRMED BUGS (7)


### HSH-AUTO-001 — HIGH
- **Route:** http://localhost:3000/products
- **Feature:** Journey 2 Products
- **Steps:** Full products flow
- **Expected:** All steps pass
- **Actual:** locator.click: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for getByRole('button', { name: /Add Product/i }).first()[22m
[2m    - locator resolved to <button type="button" class="page-module__ox25rq__primaryButton">…</button>[22m
[2m  - attempting click action[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <div class="page-module__ox25rq__modalBackdrop">…</div> intercepts pointer events[22m
[2m    - retrying click action[22m
[2m    - waiting 20ms[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <div class="page-module__ox25rq__modalBackdrop">…</div> intercepts pointer events[22m
[2m    - retrying click action[22m
[2m      - waiting 100ms[22m
[2m    29 × waiting for element to be visible, enabled and stable[22m
[2m       - element is visible, enabled and stable[22m
[2m       - scrolling into view if needed[22m
[2m       - done scrolling[22m
[2m       - <div class="page-module__ox25rq__modalBackdrop">…</div> intercepts pointer events[22m
[2m     - retrying click action[22m
[2m       - waiting 500ms[22m

- **Evidence:** locator.click: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for getByRole('button', { name: /Add Product/i }).first()[22m
[2m    - locator resolved to <button type="button" class="page-module__ox25rq__primaryButton">…</button>[22m
[2m  - attempting click action[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <div
- **Screenshot:** qa-results/latest/bugs/HSH-AUTO-001.png (if captured)


### HSH-AUTO-002 — HIGH
- **Route:** http://localhost:3000/customers
- **Feature:** Customers
- **Steps:** Create QA Customer Alpha yimwt
- **Expected:** Visible in list
- **Actual:** Not visible after reload
- **Evidence:** Hebrih Slaughter HouseManagement SystemManagement DashboardMy OfficeProductsCustomersSuppliersAccountsPurchasesSalesPaymentsWorkersVehiclesTasksReportsInvoiceSettingsAccess RVBHebrih Slaughter HouseCustomersManage customer information, types, balances and history.Thu, 24 Sept 202604:13 amCustomer Ty
- **Screenshot:** qa-results/latest/bugs/HSH-AUTO-002.png (if captured)


### HSH-AUTO-003 — HIGH
- **Route:** http://localhost:3000/customers
- **Feature:** Customers
- **Steps:** Create QA Customer Beta yimwt
- **Expected:** Visible in list
- **Actual:** Not visible after reload
- **Evidence:** Hebrih Slaughter HouseManagement SystemManagement DashboardMy OfficeProductsCustomersSuppliersAccountsPurchasesSalesPaymentsWorkersVehiclesTasksReportsInvoiceSettingsAccess RVBHebrih Slaughter HouseCustomersManage customer information, types, balances and history.Thu, 24 Sept 202604:13 amCustomer Ty
- **Screenshot:** qa-results/latest/bugs/HSH-AUTO-003.png (if captured)


### HSH-AUTO-004 — HIGH
- **Route:** http://localhost:3000/customers
- **Feature:** Customers
- **Steps:** Create QA Customer Gamma yimwt
- **Expected:** Visible in list
- **Actual:** Not visible after reload
- **Evidence:** Hebrih Slaughter HouseManagement SystemManagement DashboardMy OfficeProductsCustomersSuppliersAccountsPurchasesSalesPaymentsWorkersVehiclesTasksReportsInvoiceSettingsAccess RVBHebrih Slaughter HouseCustomersManage customer information, types, balances and history.Thu, 24 Sept 202604:14 amCustomer Ty
- **Screenshot:** qa-results/latest/bugs/HSH-AUTO-004.png (if captured)


### HSH-AUTO-005 — HIGH
- **Route:** http://localhost:3000/customers
- **Feature:** Journey 3 Customers
- **Steps:** Full customers flow
- **Expected:** All steps
- **Actual:** locator.click: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for getByRole('button', { name: /Add Customer/i }).first()[22m
[2m    - locator resolved to <button type="button" class="page-module__Kl9ugq__primaryButton">…</button>[22m
[2m  - attempting click action[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <div class="page-module__Kl9ugq__modalBackdrop">…</div> intercepts pointer events[22m
[2m    - retrying click action[22m
[2m    - waiting 20ms[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <div class="page-module__Kl9ugq__modalBackdrop">…</div> intercepts pointer events[22m
[2m    - retrying click action[22m
[2m      - waiting 100ms[22m
[2m    29 × waiting for element to be visible, enabled and stable[22m
[2m       - element is visible, enabled and stable[22m
[2m       - scrolling into view if needed[22m
[2m       - done scrolling[22m
[2m       - <div class="page-module__Kl9ugq__modalBackdrop">…</div> intercepts pointer events[22m
[2m     - retrying click action[22m
[2m       - waiting 500ms[22m

- **Evidence:** locator.click: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for getByRole('button', { name: /Add Customer/i }).first()[22m
[2m    - locator resolved to <button type="button" class="page-module__Kl9ugq__primaryButton">…</button>[22m
[2m  - attempting click action[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <di
- **Screenshot:** qa-results/latest/bugs/HSH-AUTO-005.png (if captured)


### HSH-AUTO-006 — HIGH
- **Route:** http://localhost:3000/accounts
- **Feature:** Journey 5 Banks
- **Steps:** Full banks + transfer
- **Expected:** All
- **Actual:** locator.click: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for getByRole('button', { name: /Transfer/i }).first()[22m
[2m    - locator resolved to <button type="button" class="page-module__SQfBAG__secondaryButton">…</button>[22m
[2m  - attempting click action[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <div class="page-module__SQfBAG__modalBackdrop">…</div> intercepts pointer events[22m
[2m    - retrying click action[22m
[2m    - waiting 20ms[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <div class="page-module__SQfBAG__modalBackdrop">…</div> intercepts pointer events[22m
[2m    - retrying click action[22m
[2m      - waiting 100ms[22m
[2m    29 × waiting for element to be visible, enabled and stable[22m
[2m       - element is visible, enabled and stable[22m
[2m       - scrolling into view if needed[22m
[2m       - done scrolling[22m
[2m       - <div class="page-module__SQfBAG__modalBackdrop">…</div> intercepts pointer events[22m
[2m     - retrying click action[22m
[2m       - waiting 500ms[22m

- **Evidence:** locator.click: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for getByRole('button', { name: /Transfer/i }).first()[22m
[2m    - locator resolved to <button type="button" class="page-module__SQfBAG__secondaryButton">…</button>[22m
[2m  - attempting click action[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <div 
- **Screenshot:** qa-results/latest/bugs/HSH-AUTO-006.png (if captured)


### HSH-AUTO-007 — HIGH
- **Route:** http://localhost:3000/tasks
- **Feature:** Task duplicate invariant
- **Steps:** Full
- **Expected:** PASS
- **Actual:** locator.click: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for locator('text=QA Unique Task yimwt').first().locator('xpath=ancestor::article').first().getByRole('button', { name: /Modify/i }).first()[22m
[2m    - locator resolved to <button type="button" title="Modify" aria-label="Modify QA Unique Task yimwt" class="page-module__UgkEVG__rowEditButton">…</button>[22m
[2m  - attempting click action[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <div class="page-module__UgkEVG__modalBackdrop">…</div> intercepts pointer events[22m
[2m    - retrying click action[22m
[2m    - waiting 20ms[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <div class="page-module__UgkEVG__modalBackdrop">…</div> intercepts pointer events[22m
[2m    - retrying click action[22m
[2m      - waiting 100ms[22m
[2m    29 × waiting for element to be visible, enabled and stable[22m
[2m       - element is visible, enabled and stable[22m
[2m       - scrolling into view if needed[22m
[2m       - done scrolling[22m
[2m       - <div class="page-module__UgkEVG__modalBackdrop">…</div> intercepts pointer events[22m
[2m     - retrying click action[22m
[2m       - waiting 500ms[22m

- **Evidence:** locator.click: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for locator('text=QA Unique Task yimwt').first().locator('xpath=ancestor::article').first().getByRole('button', { name: /Modify/i }).first()[22m
[2m    - locator resolved to <button type="button" title="Modify" aria-label="Modify QA Unique Task yimwt" class="page-module__UgkEVG__rowEditButton">…</button>[22m
[2m  - attempting click action[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - 
- **Screenshot:** qa-results/latest/bugs/HSH-AUTO-007.png (if captured)


**Count by severity:** BLOCKER: 0, CRITICAL: 0, HIGH: 7, MEDIUM: 0, LOW: 0

## POSSIBLE UPGRADES (2)


### HSH-UPG-001
- **Page:** /customers
- **Current:** Validation
- **Why inconvenient:** Invalid phone 'abc' should show 'Invalid phone number' error
- **Suggestion:** Ensure phone regex validation message is visible
- **Priority:** HIGH VALUE


### HSH-UPG-002
- **Page:** /accounts
- **Current:** Transfer same-account validation
- **Why inconvenient:** Same-account transfer should show error 'Source and destination must be different'
- **Suggestion:** Ensure error is visible in dialog
- **Priority:** HIGH VALUE


## PASSED WORKFLOWS (16)

- Dashboard empty state usable — no fatal overlay, no NaN — PASS
- Suppliers: create 2, edit, search, delete clean — PASS
- Bank transfer 20000 Cash->BDL verified via UI — PASS
- Purchases: lightweight UI controls verified — PASS
- Sales: lightweight UI controls verified — PASS
- Payments: lightweight UI controls verified — PASS
- Workers: lightweight UI controls verified — PASS
- Vehicles: lightweight UI controls verified — PASS
- Tasks: lightweight UI controls verified — PASS
- Reports: lightweight UI controls verified — PASS
- Invoice: lightweight UI controls verified — PASS
- Notifications: lightweight UI controls verified — PASS
- Settings: lightweight UI controls verified — PASS
- Office: lightweight UI controls verified — PASS
- Global UI: theme, search, reload — PASS
- Random exploration: 5 steps, no pageerror — PASS

## CONSOLE / NETWORK FINDINGS

- **pageerror:** 0 
- **console.error (filtered):** 36 
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/products
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/customers
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/customers
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/customers
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/customers
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/suppliers
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/suppliers
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/accounts
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/purchases
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/sales
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/payments
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/workers
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/vehicles
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/tasks
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/reports
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/invoice
  - Failed to load invoice data DexieError @ http://localhost:3000/invoice
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/notifications
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/settings
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/office
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/office
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/tasks
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/tasks
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/tasks
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/tasks
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/tasks
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/settings
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/suppliers
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/office
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/sales
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/sales
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/office
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/purchases
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/products
  - Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:3000/products
- **requestfailed:** 0 
- **http >=500:** 0 

Whitelisted (not counted as bug):
- 401 /api/rvb/auth/refresh (RVB unauth for H.S.H user)
- Failed to fetch /api/sync/* (timing, offline handled)
- Duplicate extension names (tiptap)
- ConstraintError Key already exists (invoice duplicate handled)

## NOT TESTED

- Physical printing (hardware) — print button and print-preview routes were clicked via Chromium, only paper output not verified.
- Production Atlas — never mutated (QA isolated).
- R.V.B flows — out of scope.

## FINAL QUALITY SUMMARY

Autonomous user explored H.S.H via real Chromium, created coherent fake business dataset (QA Product Beef/Lamb/Liver, QA Customer Alpha/Beta/Gamma, QA Supplier North/South, QA Bank Cash/BDL/Other, QA Worker Karim/Samir, QA Vehicle Truck 01), performed realistic workflows, and collected findings. No fixes were applied during this audit run (audit-only).

**This is an autonomous-user audit, not release certification. Do not say READY TO FREEZE based on this alone.**

---

*Generated by autonomous Playwright agent (frontend/e2e/autonomous/user-journey.spec.ts) via `npm run qa:user`*
