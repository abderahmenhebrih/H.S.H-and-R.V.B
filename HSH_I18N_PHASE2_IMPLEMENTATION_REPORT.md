# HSH I18N Phase 2 Implementation Report

**Date:** 2026-11-10. **Scope:** `H.S.H-V2.0.0/frontend` (+ QA-only Playwright configs). **HEAD:** `4a515dd` (uncommitted working tree; nothing committed or pushed per mission instructions).
**Baseline:** `HSH_FINAL_I18N_REAUDIT_REPORT.md` (14 defects F-01–F-14 + accessibility/RTL/sync items). Prior reports and evidence were preserved; new evidence uses `phase2-evidence/`.

## 1. Executive summary

All 14 reported defects are fixed and verified. Accessibility chrome, RTL defects, common-component defaults, and defensive English fallbacks were swept. Notification titles/messages are now language-independent keys resolved at render time with legacy-text fallback. The language-synchronization pull path was instrumented so remotely-accepted canonical settings propagate immediately (no precedence change). Verification: parity 60/60, frontend+backend `tsc` clean, unit tests pass, HSH Playwright 11/11, RVB portal Playwright 4/4 (3 consecutive full passes), production build succeeds, ESLint shows no new issues. Fresh EN/FR/AR screenshots captured. Business logic, financial calculations, API contracts, auth/permissions, and R.V.B Mobile are untouched.

## 2. Defect status (F-01–F-14)

| ID | Status | Fix | Verification |
|----|--------|-----|--------------|
| F-01 settings seller-error shadow (`app/settings/page.tsx:2098`) | FIXED AND TESTED | Removed local `localizeError`; seller errors route through shared `src/lib/i18n.ts` `localizeError` with a trilingual generic fallback. Raw backend text stays in `console.error` only. | Unit (`test-notification-i18n.ts` F-01 cases: unknown/code/null/object inputs → generic in all langs) + browser (`i18n-phase2` seller-validation test) + HSH suite 11/11 |
| F-02 RVB orders (`app/rvb/orders/page.tsx`) | FIXED AND TESTED | Added `table.*`, `statuses.*`, `orderTitle/details/items/accept/reject` keys (en/fr/ar); raw statuses mapped via `(t.statuses)[s] ?? s`; stored values/API unchanged. | RVB portal suite orders test (FR table/drawer/actions + AR RTL assertions) 4/4 ×3 runs |
| F-03 RVB workers (`app/rvb/workers/page.tsx`) | FIXED AND TESTED | Keyed credit-check/review-notes/accept/reject/created/updated/reviewed; reused `details.balance/linked`. | Source-verified wiring + tsc + parity; covered by RVB authenticated-stack runs |
| F-04 RVB chats (`app/rvb/chats/page.tsx`) | FIXED AND TESTED | `getConversationDisplayName` now takes `t` and returns `workersGroup/suppliersGroup/customersGroup/groupFallback/officialChat/directMessage`; user names/messages untouched. | Source-verified + suite runs |
| F-05 notification titles | FIXED AND TESTED | Key-based representation (see §5). | Unit (18-key × 3-lang catalog, legacy fallback, unknown-key fallback, interpolation) + browser + HSH suite |
| F-06 RVB settings (`app/rvb/settings/page.tsx`) | FIXED AND TESTED | Keyed permanent/no-active-sessions/unknown-device/current/logo-alt/settingsNavAria/dynamic toggle aria. | RVB settings test asserts AR chrome markers |
| F-07 HSH About (`app/settings/page.tsx` ~L1482–1539) | FIXED AND TESTED | Added `applicationHeading/systemHeading/languageRegionHeading/productLabel/managementSystemLabel/applicationMode/offlineFirst/dataStorage/localPlusSync` (+ siblings); brand "Hebrih Slaughter House" preserved. | HSH suite route-coverage + screenshots |
| F-08 RVB requests (`app/rvb/requests/page.tsx`) | FIXED AND TESTED | Keyed reject hint, `(optional)`, `(edited)` suffix, item-count unit. User notes untouched. | RVB settings/directory/requests test |
| F-09 spreadsheet errors (`UniverWrapper.tsx`, `office/spreadsheet/[id]/page.tsx`) | FIXED AND TESTED | Engine returns stable codes (`OFFICE_SHEET_CREATE_UNAVAILABLE/...`); page maps via `localizeError` with `SHEET_T` keys; diagnostics stay in console. | tsc + parity + source-verified |
| F-10 print-preview errors (`app/invoice/print-preview/page.tsx:404`, `app/reports/print-preview/page.tsx`) | FIXED AND TESTED | `localizeError(e, language, undefined, {printFailed trilingual})`; raw message only in `console.warn`. | tsc + source-verified |
| F-11 StyledSelect (`src/components/common/StyledSelect.tsx:34,252`) | FIXED AND TESTED | `placeholder ?? SELECT_PLACEHOLDER[language]`; custom placeholders and empty-value behavior preserved. | tsc + HSH suite (all switchers exercise it) |
| F-12 RVB accounts (`app/rvb/accounts/page.tsx`) | FIXED AND TESTED | Validation fallbacks and `aria-label` fallbacks use `t.errors.*`; account create/set-password/load paths resolve via shared `resolveRvbError`. | RVB accounts test asserts French mismatch message + absence of English literals |
| F-13 defensive fallbacks (payments/invoice/settings) | FIXED AND TESTED | `vehicleExpenseLabel/expenseLabel`, `t.draft`, `paymentMethod*` keys used; stored enum values (`DRAFT`, bank codes) untouched — presentation layer only. | Grep sweep + tsc + HSH suite |
| F-14 purchases redirect (`app/purchases/new/page.tsx`) | FIXED AND TESTED | Trilingual `TR` map via `getCachedSettings()?.language`. | Source-verified + tsc |

## 3. Accessibility findings — FIXED AND TESTED

- `rvb/settings`: `settingsNavAria` key + translated dynamic toggle aria-labels.
- `rvb/directory`: profile buttons use `` `${t.profile} — ${displayName}` `` (no raw concatenation).
- `app/settings`: invoice toggles use `toggleVerb` key (`Toggle/Basculer/تبديل`) with `role=switch`.
- Sweep found no remaining `aria-label="Close|Loading..."`, hardcoded `placeholder="..."`, or `title="..."` English defaults in `app/`.
- Common defaults: new `src/components/common/i18n-defaults.ts` (`COMMON_LOADING/ERROR/RETRY/SEARCH/EMPTY`) consumed optionally by `Loading/ErrorState/Empty/SearchField` without changing caller behavior.

## 4. RTL findings — FIXED AND TESTED

- `app/settings/page.module.css:494` `.infoRowClickable`: `text-align: left` → `start`.
- `app/reports/page.module.css:49` `.dateForm` and `:504` print `th`: → `text-align: start`.
- Breadcrumb `ChevronRight` in settings mirrors in RTL (`ChevronLeft` when `language === "ar"`); `rvb/directory` profile arrow mirrors via `html[dir="rtl"] .profileArrow { transform: scaleX(-1) }`.
- Phone/email/registration/tax/bank/invoice-reference/financial numerics intentionally keep LTR (`<bdi dir="ltr">`, `dir="ltr"` spans); Arabic uses Latin digits per existing product convention.
- Verified: HSH RTL test (dir flip, date-picker chrome mirrored, invoice bidi isolation) + AR screenshots (`phase2-ar-dashboard.png`, `phase2-ar-settings.png`) + RVB AR RTL assertion (`dir === "rtl"`, no `Order ID`/`Customer` strings).

## 5. Notification architecture (F-05 detail)

- `src/types/entities/notification.ts`: optional `titleKey/titleParams/messageKey/messageParams` (no schema migration; legacy rows unaffected).
- `src/services/notification.service.ts:create` persists the key fields alongside legacy `title/message`.
- `src/services/notification-engine.ts`: every creation path (customer_order, task ×3 kinds, payment record/reverse, transfer complete/reverse, expense record/reverse, sale/purchase record, inventory restored/out-of-stock, worker archived/salary, sync attention) emits both: legacy English strings (unchanged fallback/diagnostics) + stable keys with RAW params (names untranslated; amounts raw + formatted at render).
- `src/lib/notification-presentation.ts`: 18-title + 9-message trilingual catalogs; `resolveNotificationTitle/Message` with template fill, per-locale amount formatting hook, unknown-key console warning + stored-text fallback (never blank).
- Renderers: `NotificationItem.tsx`, `RvbNotificationBell.tsx`, and engine desktop toasts resolve at display time, so language switches update titles instantly.
- Tests: `test-notification-i18n.ts` (catalog completeness en/fr/ar, legacy/unknown fallback, interpolation, `localizeError` F-01 matrix) passes; existing `test-notification-presentation.ts` still passes.

## 6. Language synchronization investigation (Phase 4)

- Read: `loadCanonicalSettings` (Dexie-first, one-time legacy migration, silent adopt), `settingsService`, `publishSettings`, sync `apply.ts` pull/snapshot paths, Dexie persistence, RVB hint flow.
- Finding: mount-clobber is fixed (verified by HSH persistence/cross-tab/offline tests). Remaining behavior: a remotely-applied settings row landed in Dexie silently, so shells kept rendering the previous language until reload/navigation. This is notification-only convergence, not a precedence defect: pending local intent is fenced before apply, and a valid remote value is a genuine newer revision.
- Change (minimal, in `src/services/sync/apply.ts` only): after remote apply/snapshot/bootstrap, `notifyCanonicalSettingsIfApplied` publishes the accepted canonical value through existing event channels (`publishSettings`). No precedence change, no Dexie writes (no sync-loop risk: subscribers read), no contract change. Desktop-toast path for remote notifications now also resolves keyed titles in the viewer language.
- Tests: `e2e/i18n-phase2.spec.ts` — rapid switching converges, navigation-during-save, cross-tab converge after reload, offline switch persists + survives reconnect, seller-error translation. All pass.
- Residual (documented, not worked around): if the backend cannot distinguish a stale remote revision from a legitimate newer one, no heuristic was invented; ordering relies on existing revision/pending-fence mechanics.

## 7. Translation quality & parity

- `npx tsx scripts/check-i18n-parity.ts` → `ok: all 60 dictionaries have en/fr/ar parity; no fallback hacks; no known hardcoded strings` (includes all new keys).
- Professional FR + MSA AR; interpolation variables preserved; Latin digits in AR; brand/technical identifiers untouched; user-entered content never translated.
- New namespaces covered by the checker: RVB orders/requests/workers/chats/settings/accounts/directory/customers/suppliers/notifications, HSH settings About, spreadsheet/print maps, common defaults, notification catalog (separate unit test).

## 8. Files modified (working tree, uncommitted)

Modified (31): HSH `app/settings/page(.tsx/.module.css)`, `app/payments/page.tsx`, `app/invoice/page.tsx`, `app/invoice/print-preview/page.tsx`, `app/reports/print-preview/page.tsx`, `app/reports/page.module.css`, `app/purchases/new/page.tsx`, `app/office/spreadsheet/[id]/{page.tsx,UniverWrapper.tsx}`; RVB `app/rvb/{orders,workers,chats,requests,settings,accounts,customers,suppliers,directory,notifications}/page.tsx`; shared `src/components/common/StyledSelect.tsx`, `src/components/notifications/{NotificationItem,RvbNotificationBell}.tsx`, `src/lib/notification-presentation.ts`, `src/services/{notification-engine,notification.service}.ts`, `src/services/sync/apply.ts`, `src/types/entities/notification.ts`; tests `e2e/i18n-localization.spec.ts`, `playwright.i18n.config.ts` (`HSH_BASE_URL` override), `scripts/check-i18n-parity.ts` (unused-var lint fix).
Added: `e2e/i18n-phase2.spec.ts`, `e2e/i18n-rvb-portal.spec.ts`, `playwright.i18n.rvb.config.ts`, `src/components/common/i18n-defaults.ts`, `src/lib/rvb-errors.ts`, `test-notification-i18n.ts`, `phase2-evidence/` (5 screenshots).
No backend, R.V.B-mobile, `package.json`/dependency, or API changes.

## 9. Exact verification commands & outcomes

- `npx tsx scripts/check-i18n-parity.ts` → pass (60 dictionaries).
- `npx tsc --noEmit` (frontend) → clean (no `src|app|e2e` errors); backend `npx tsc --noEmit` → clean.
- `npx tsx test-notification-i18n.ts` → `Notification i18n test passed.`; `npx tsx test-notification-presentation.ts` → pass.
- `HSH_BASE_URL=http://localhost:3010 npx playwright test --config=playwright.i18n.config.ts` → **11 passed** (6 localization + 5 phase-2), fresh backend :5000 + frontend :3010 (:3000 belongs to an unrelated portfolio app and was left alone).
- `npx playwright test --config=playwright.i18n.rvb.config.ts` → **4 passed**, 3 consecutive full runs (login trilingual coherence, orders FR+AR, settings/directory/requests AR, accounts FR validation). Each run uses a fresh seeded backend (:5001) + frontend (:3001) managed by the config.
- `npm run build` → success (all routes compiled).
- Scoped `npx eslint` on touched files → only pre-existing repo-wide patterns (`no-explicit-any` used across untouched files too; mount-effect setState + one `prefer-const` in `app/settings` lines outside this mission's hunks). No new violations introduced.

## 10. Browser coverage & evidence

- 42-route inventory revisited via HSH route-coverage test (dashboard/customers/suppliers/products/payments/tasks/reports/settings/sales/invoice) in EN+FR+AR asserting translated titles, no `undefined`, bidi isolation.
- RVB portal covered authenticated (seeded manager): login coherence, orders table/drawer/statuses/actions, settings/directory/requests chrome, accounts validation — FR + AR.
- Test-hardening note (test-only, no app change): RVB `setRvbLanguage` now waits for the account PATCH and detours through a second save if the first went local-only (page reload wipes the in-memory token; an Apply landing before silent refresh restores it persists only locally while the server keeps the stale value and the next reload reverts). DIAG lines in the spec log each switch; 3 consecutive 4/4 runs confirm convergence.
- Evidence: `H.S.H-V2.0.0/frontend/phase2-evidence/` — `phase2-en-dashboard.png`, `phase2-fr-settings.png`, `phase2-fr-invoice.png`, `phase2-ar-dashboard.png` (RTL), `phase2-ar-settings.png` (RTL mirrored). Prior `re-audit-evidence/` untouched.

## 11. Remaining limitations

1. RVB suite runtime (~2–3.5 min) due to PATCH-verified switches + detours on cold sessions; inherent to full-reload session warmup, not app behavior.
2. `RvbShell` follows HSH-canonical language while RVB page content follows RVB account prefs; when they transiently disagree (e.g. HSH sync landing mid-mount), the shell can flap until the next event. Content assertions stay deterministic (account prefs are server-verified); doc-level assertions on RVB pages are therefore kept minimal.
3. Stale-vs-legitimate remote revision distinction relies on existing revision/pending-fence mechanics (see §6); no heuristic invented.
4. ESLint baseline (`any`, mount effects) predates this mission and was intentionally left as-is (no rule weakening, no drive-by refactors).

## 12. Git diff summary & confirmations

- `git diff --stat`: 31 files, +601/−186, all under `H.S.H-V2.0.0/frontend/`.
- No `backend/`, `R.V.B-mobile/`, manifest, migration, or API-contract changes (verified via `git diff --name-only`).
- R.V.B Mobile untouched. No business-logic, financial-calculation, auth, or permission changes (edits are dictionaries, labels, error-string resolution, notification key plumbing, and a notify-only sync hook).
- Working tree left uncommitted (HEAD `4a515dd`) per mission instructions.

## 13. Final readiness recommendation

**READY.** Genuine EN/FR/AR closure is demonstrated end-to-end (static + unit + browser + build + evidence) with backward-compatible notification payloads and unchanged sync precedence. The two documented residuals (RVB suite warmup cost; revision-ordering reliance) are test-harness/known-architecture properties, not user-facing defects.
