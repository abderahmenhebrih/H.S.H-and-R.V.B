# HSH Final I18N Re-Audit Report (Independent)

**Date:** 2026-11-10. **Auditor role:** independent re-audit, read-only (no source modified).
**Scope:** `H.S.H-V2.0.0/frontend` (+ `backend/src/qa-server.ts` QA harness). `R.V.B-mobile` code untouched.
**Inspected commit:** `4a515dd` ("129", HEAD; all prior implementation work committed — working tree clean except my new audit artifacts).
**Method:** static source inspection (`read`/`grep`), independent subagent sweeps (read-only), full verification suite executed (parity, tsc frontend+backend, unit tests, Playwright Chromium × multiple runs incl. the official `playwright.config.ts` path with fresh backend, production build, scoped ESLint), fresh browser evidence with screenshots, write-trap + Dexie probes, direct code reads for every FAILED claim below.

---

## 1. Executive verdict

**The core translation system is sound and largely complete, but the audit reproduces genuine untranslated user-facing UI that the previous report claimed fixed — concentrated in the RVB web portal (`rvb/orders`, `rvb/workers`, `rvb/requests`, `rvb/chats`, `rvb/settings`), HSH Settings About section, notification-engine titles, and one error-localization shadow that leaks raw English. The 6/6 Playwright suite passes on committed code, but its route coverage does not touch the defective screens, so green tests do not contradict these findings.**

Verdict category counts: VERIFIED 18 · SOURCE-VERIFIED 14 · PARTIAL 3 · FAILED 14 (1 High, 5 Medium, 8 Low/Trivial) · BLOCKED 0 · UNRESOLVED 1.

**Final recommendation: C. NOT READY** — blocking localization defects remain (see §15: rvb/orders fully-English table, notification-engine English titles, settings seller-error English passthrough, rvb/workers + rvb/chats + rvb/requests + rvb/settings gaps). They are enumerated, localized, and small to fix — but they exist, so READY cannot be honestly declared.

---

## 2. Repository state and inspected commit

- HEAD `4a515dd` ("129", 2026-11-10) contains all 71 files of prior implementation work (3682+/851-). Working tree was clean at audit start; only my new audit artifacts are untracked (`re-audit-evidence/`, this report).
- Prior reports present and read: `HSH_I18N_REPAIR_REPORT.md` (implementation + QA claims), `I18N_AUDIT_REPORT.md` (original diagnostic).
- `R.V.B-mobile`: **zero modified files.** One binary asset (`assets/android-icon-background.png`, pre-existing untracked file) was swept into commit `4a515dd`. Observation, not a defect: no code, config, or translation touched.
- Backend diff vs `00fd1fb`: **only** `src/qa-server.ts` (`instanceOpts: [{ launchTimeout: 120000 }]`). No API, schema, or runtime behavior change. Verified via `git show`.
- Prior implementation report contains a duplicated "Phase 2 — Routes" section (editorial duplication, second copy omits the settings-modal updates; content itself verified present in source).

---

## 3. Previous report claims vs actual source

| Claim | Re-audit finding | Category |
|---|---|---|
| 60/60 dictionary parity, no `(t as any)` hacks | **Confirmed.** Parity checker passes on current source; independent grep finds no `|| "English"` value-fallbacks; remaining `(t as any).x ?? data` patterns fall back to data values, not English literals. | VERIFIED |
| All routes have en/fr/ar dicts | **Confirmed.** 42 `app/**/page.tsx` inventoried; 38 UI routes have dicts; 4 without are pure redirects (3 with zero UI; `purchases/new` shows transient English "Redirecting to purchase entry…" — trivial, listed §5). | VERIFIED |
| Shared components consume language | **Confirmed** for all 19 language-aware components (props verified at declaration + use sites). `RvbKpiCard.language` is a dead prop, `FormalInvoiceDocument.uiLanguage` unused (doc language from data, defaults `"fr"`) — harmless, noted. | VERIFIED |
| Backend errors localized via `localizeError` | **PARTIALLY FALSE.** A **local shadow** `localizeError` in `app/settings/page.tsx:2058` bypasses the shared helper and returns raw English for any message lacking "fail/error" (verified by direct read). One call site (`setSellerError`, seller profiles). Real English leak. | FAILED (High-Medium) |
| RVB portal alerts/modals translated | **PARTIALLY FALSE.** `rvb/orders` table/drawer/buttons/headers fully English + raw status enums; `rvb/workers` detail/review strings English; `rvb/requests` info strings English; `rvb/chats` display names English; `rvb/settings` misc strings English (all verified by direct read). Raw `|| "Password is required"`-style fallbacks in `rvb/accounts`. | FAILED (High for orders table) |
| Print/PDF + `bdi` isolation complete | **Confirmed** for invoice doc (all identifiers wrapped, verified). `APP_PDF_LABELS` trilingual, usages language-aware. Two `e.message` passthroughs remain in print-preview catch paths (verified). | PARTIAL |
| RTL fixed (logical properties, chevrons, alignment) | **Confirmed dominant**, 3 minor defects remain (`infoRowClickable`, reports `dateForm`/print `th` hardcoded left; breadcrumb chevron unmirrored — cosmetic). No `ml-/mr-` Tailwind, no physical margin/padding defects (explicit RTL overrides verified correct). | PARTIAL |
| Switching/persistence + mount-clobber fix + hint | **Confirmed present and working** (`canonicalReadyRef` gates in HEAD settings+office, `writeRvbLanguageHint` in `publishSettings`, `languageInitScript` in layout). Behavior verified in browser (6/6 + trap + Dexie probes). | VERIFIED |
| `qa:i18n` + launchTimeout fix | **Confirmed working, with a caveat.** `qa-server.ts` boots under the official config (observed `[QA] Starting MongoMemoryReplSet` → success in run output). Caveat: committed `qa:i18n` script points at `playwright.config.ts` (own servers), while prior validation used `playwright.i18n.config.ts` (reuse running servers). Both verified working in this audit (see §8). | VERIFIED |

**Methodological note (important): the parity checker passes DESPITE the FAILED findings above. Parity validates dictionaries that exist; it cannot detect JSX that never consults a dictionary. Dictionary parity must never be cited as translation proof — this re-audit confirms that distinction with concrete counterexamples.**

---

## 4. Language architecture verification

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Default resolution | `DEFAULT_SETTINGS.language = "en"`; `resolveLanguage()` coerces unknown → en | `lib/settings.ts:112`, `lib/i18n.ts:6` — SOURCE-VERIFIED |
| 2 | Dexie retrieval | Canonical `loadCanonicalSettings()` Dexie-first, one-time migration, silent adopt; per-page `settingsService.get()` reads | `services/settings.service.ts:51-92` — SOURCE-VERIFIED |
| 3 | Selection UI | Settings `StyledSelect` → `pendingChange` → confirm modal → `settingsService.save` → `publishSettings` | `app/settings/page.tsx:775,790` + browser test 1 — VERIFIED |
| 4 | Propagation | `publishSettings` → live cache + mirror + `SETTINGS_EVENT` + `RVB_UI_PREFERENCES_EVENT`; shells + pages subscribe; `storage` cross-tab re-read | `lib/settings.ts:114-126`, `AppShell.tsx:539-548` + browser — VERIFIED |
| 5 | CustomEvents | Both channels carry identical canonical detail; RVB channel local-only in shells (`readRvbEvent` never writes cache) | `AppShell.tsx:510-528` — SOURCE-VERIFIED |
| 6 | `document.lang/dir` | Always paired writes at every site inspected (shells, settings save paths, init script, RVB service) | grep-verified 20+ sites — VERIFIED |
| 7 | Pre-paint | `languageInitScript` reads `rvb-ui-language`/`hebrih-language`, validates, sets lang+dir pre-hydration; `suppressHydrationWarning` kept | `app/layout.tsx:14` — SOURCE-VERIFIED |
| 8 | Reload persistence | Dexie canonical restored; hint accelerates pre-paint | Browser tests 5 + Dexie probes — VERIFIED |
| 9 | Cross-tab | `storage` → canonical re-read | `AppShell.tsx:531-537` — SOURCE-VERIFIED |
| 10 | HSH→RVB hint | `writeRvbLanguageHint` inside `publishSettings` (single canonical funnel) | `lib/settings.ts:102-117` — SOURCE-VERIFIED |
| 11 | RVB account precedence | `getPresentationSettings`: account `ui.language` (when token) else local; `syncFromAccount` on login/`user.id` | `rvb-ui-preferences.service.ts:185-251`, `RvbAuthContext.tsx:67-98` — SOURCE-VERIFIED |
| 12 | Single canonical source | Dexie canonical is the only runtime value source for HSH; RVB account prefs authoritative only when authenticated; no competing writers found (write-trap audit: paired writes only, converge to saved language) | Trap + Dexie probes + 20s sampling (`ar\|rtl` stable) — VERIFIED |

**Transient `/invoice` ar→fr (prior report §11): investigated, root cause identified and fixed in HEAD:**
- Mechanism (proven via document.write trap on the pre-fix pattern): settings + office `useEffect` mirrors wrote DEFAULT en/ltr on mount **before** Dexie resolved, clobbering the pre-paint hint; joint lang|dir reads during that window observed splits.
- Fix in HEAD: `canonicalReadyRef` gates (`settings/page.tsx:597,657,688`; `office/page.tsx:391,413,424`) + hint coherence. Verified: no default writes post-mount; settle converges to saved language.
- Residual: one historical observation (fr over saved ar, single run) was never reproduced despite targeted attempts (trap runs, 20s dense sampling `["ar|rtl"]` only, Dexie-verified flows). A sync-pull-behind path remains theoretically possible on long-lived shared backends but unproven. **UNRESOLVED (leaning fixed): not a blocker for acceptance, listed with recommended canonical-wins guard in §15.**

---

## 5. Complete route and component coverage inventory

42 routes inventoried (independent sweep). 38 UI routes have en/fr/ar dicts. 4 dict-less routes are redirects; only `purchases/new` renders transient English ("Redirecting to purchase entry…", trivial).

**Reproduced defects (all verified by direct read; severity calibrated to user impact):**

| ID | Location | Issue | Sev | Status |
|---|---|---|---|---|
| F-01 | `app/settings/page.tsx:2058-2062` | Local `localizeError` shadow returns raw English for messages without "fail/error" (used by `setSellerError`) — contradicts repair report's "no direct display" claim | High-Medium | FAILED |
| F-02 | `app/rvb/orders/page.tsx:171-229` | Entire table + drawer hardcoded: `Customer/Order ID/Total/Status/Actions`, `Order {id}`, `Details`, `Accept/Reject`, raw `o.status` enums (no `t.statuses` mapping) | High | FAILED |
| F-03 | `app/rvb/workers/page.tsx:1059-1083` | `credit check:`, `Review notes:`, `Accept/Reject`, `Created/Updated/Balance/Linked` hardcoded | Medium | FAILED |
| F-04 | `app/rvb/chats/page.tsx:344-357,898,940` | `getConversationDisplayName` ignores `lang`: `Workers/Suppliers/Customers/Group/Official Chat/Direct Message` hardcoded | Medium | FAILED |
| F-05 | `src/services/notification-engine.ts:115,194,198,227-228` | Notification titles created in English only (`Payment recorded/reversed`, `Stock restored`, `Out of stock`, `Worker archived`, …) rendered verbatim in bell center | Medium | FAILED |
| F-06 | `app/rvb/settings/page.tsx:629,649,653,655,672` | `Permanent`, `No active sessions`, `Unknown device`, `Current`, `alt="RVB logo"` hardcoded | Medium-Low | FAILED |
| F-07 | `app/settings/page.tsx:1441-1484` | About section hardcoded (`Version`, `APPLICATION/SYSTEM/LANGUAGE & REGION` headings, `Product/Management System/Application Mode/Offline-first/Data Storage/Local + Sync` rows) | Medium-Low | FAILED |
| F-08 | `app/rvb/requests/page.tsx:917,930,975,1034,1038` | `Reject — optional management note…`, `(optional)`, ` (edited)`, `{n} items` hardcoded | Low | FAILED |
| F-09 | `app/office/spreadsheet/[id]/UniverWrapper.tsx:260,265,304,751` + `page.tsx:140-187` `setOfficeFeedback(err/String(e))` | English engine errors surfaced via `setOfficeFeedback` passthrough (bypasses `localizeError`) | Low | FAILED |
| F-10 | `app/invoice/print-preview/page.tsx:402`, `app/reports/print-preview/page.tsx:830` | `e.message` fallback (`Failed to load printers…`) shown raw when printing service throws | Low | FAILED |
| F-11 | `src/components/common/StyledSelect.tsx:246` | `placeholder ?? "Select"` hardcoded (component HAS `language`; empty branch at :273 is correctly localized) | Low | FAILED |
| F-12 | `app/rvb/accounts/page.tsx:442-483,499,795` | `|| "Password is required"` / `"Too short"` / `"Mismatch"` / `|| "Failed"` / `aria-label={t.actions.close\|\|"Close"}` English fallbacks | Low | FAILED |
| F-13 | `app/payments/page.tsx:528,530`, `app/invoice/page.tsx:1573,1791`, `app/settings/page.tsx:2096-2108` | `|| "Vehicle Expense"`, `|| "DRAFT"`, `|| "Invoice"`, `|| "Virement bancaire"` defensive English literals | Low | FAILED |
| F-14 | `app/purchases/new/page.tsx:14` | Transient redirect text hardcoded | Trivial | FAILED |

**Verified clean (sample-checked, not just grep-absence):** all `alert/confirm/setToast` call sites use `t.*`/`localizeError`; `title=` props translated or data-driven; `placeholder/aria-label` wired except F-11 + 4 rvb aria cases below; `notification-presentation.ts` fully trilingual; `amountInWords` trilingual; RVB `accounts/workers/suppliers/customers/directory` list screens use `t.*` for table/actions (contrast F-02).

**Remaining hardcoded aria-labels (verified):** `rvb/settings/page.tsx:495` (`Settings navigation`), `:2569/:2604` (`` Toggle ${name} ``), `rvb/directory/page.tsx:322` (`` ${name} profile ``). HSH settings aria verified translated. Low severity (assistive-tech only), listed for completeness.

---

## 6. Translation quality and fallback findings

- **Dictionaries/parity:** checker passes (60/60); spot-reads confirm real translations, not copies (e.g., settings `confirmLangTitle`: en / fr `Changer la langue de l'application ?` / ar `تغيير لغة التطبيق؟`; customers `nameRequired` en/fr/ar all distinct and correct). Interpolation (`{item}`, `{query}`, `{n}`) present and used. No empty values found. **SOURCE-VERIFIED.**
- **Arabic quality (sampled):** MSA, correctly ordered, proper business terms (`مذبح حبريح للدواجن`, `الإعدادات`, `جارٍ التحميل…`). Latin digits forced via `ar-DZ-u-nu-latn` everywhere user-facing. **SOURCE-VERIFIED + screenshot-verified.**
- **French quality (sampled):** professional business French with correct elisions/accents (`Choisissez la langue de l'application.`, `Aucune facture sélectionnée`). **SOURCE-VERIFIED + screenshot-verified.**
- **`localizeError` (shared):** exact-code + prefix + legacy-sentence matching, generic fallback per language, raw message only in `console.warn`. Sound design. Gaps: exact-string brittleness (any punctuation drift loses specificity → generic, never English to UI — safe direction); ~40 backend/operation sentences unmapped (specificity debt, generic shown). **SOURCE-VERIFIED.**
- **Error-code consistency:** stable `UPPER_SNAKE` codes mapped; legacy human sentences matched; no status-code mapping (HTTP codes surface as generic). Acceptable. **SOURCE-VERIFIED.**
- **Fallback behavior:** per-key `?? en` + dev warnings (never blank/`undefined`); checker fails build on missing fr/ar. Flag/empty audit pages still render English "Loading…" style defaults (`Loading.tsx`, `ErrorState`, shared `common` defaults are English-only, used with English literals at call sites — e.g. `RvbKpiCard` `—`, `accounts` loading strings — mostly covered by page dicts but defaults themselves untranslated). **PARTIAL** (defaults should gain `common.*` keys).

---

## 7. RTL and bidirectional findings

- **Document direction:** correct pairing everywhere; `getDirection` single source; RTL verified live (`ar|rtl` stable 20s; body `direction: rtl` asserted). **VERIFIED.**
- **Logical properties dominant** (~200+ `margin-inline/inset-inline/text-align:start`: settings, office, globals, pickers, bells). Physical `margin-left/right` reduced to one correctly-mirrored block (sales/entry with explicit `html[dir=rtl]` swap). Zero Tailwind physical-spacing classes. **VERIFIED.**
- **Defects (minor, verified):** `settings/page.module.css:494` `.infoRowClickable{text-align:left}`; `reports/page.module.css:49` `.dateForm`, `:504` print `th` hardcoded left; breadcrumb `ChevronRight` unmirrored (cosmetic). **FAILED (Low).**
- **Chevrons/arrows:** date-picker `PrevIcon/NextIcon` swap on `ar` verified in code + asserted live (fr + ar chrome visible). Expand-chevron rotations vertical-only (correct). RVB `scaleX(-1)` arrows verified. **VERIFIED.**
- **Tables/invoice:** per-document `dir={getDirection(docLang)}` independent of UI lang (correct); numeric-right/desc-left by design; phones/emails/RC/NIF/NIS/bank/refs wrapped `<bdi dir="ltr">` (verified lines 266-274, 328-341 + 15+ RVB `@tag`/phone `dir="ltr"` sites). **VERIFIED.**
- **Layout/positioning:** symmetric overlays, drawer mirroring, viewport-anchored popovers with dir-aware JS branches, off-screen a11y hiding — all benign. **SOURCE-VERIFIED.**
- Dashboard cards/chart labels translate (screenshots); chart geometry intentionally LTR (documented, correct). **VERIFIED.**

---

## 8. Locale formatting and business integrity

- Locale selection per language with Latin digits for Arabic in `i18n.ts`, `money.ts`, `compact-number.ts`, `date-format.ts`, `datetime.ts`, `dashboard-overview.ts` (verified line-by-line; `en-GB`/`en-US` only in `catch` fallbacks or the dashboard's documented `en-US` base — no language-ignoring hardcode found). **VERIFIED.**
- **Math/business separation verified:** `roundMoney`/`computeLineTotals`/`sumMoney`/`aggregateByBuckets`/`getPeriodRange` take numbers only; `language` feeds labels/locales exclusively. No API payload, stored value, total, tax, sorting, or filtering depends on language (formatters are presentation-layer; `DD/MM/YYYY` deterministic). **VERIFIED.**
- Invoice/print formatting follows document/UI language; totals use `formatCurrency` (presentation). **SOURCE-VERIFIED.**
- Unit tests `test-compact-number.ts`, `test-date-format.ts` pass; live `Intl` spot-checks (en `1,500` / fr `1 500`+`,` decimals / ar `1.500` Latin digits; dates `08/11/2026` ×3) confirm presentation-only localization. **VERIFIED.**

---

## 9. Error localization findings

- Shared `localizeError` sound (see §6); per-page code maps verified in use across entity routes; `setError(err.message)`/`setToast(e.message)` direct display: **none found** except via the F-01 shadow and F-09/F-10 passthroughs.
- **F-01 detail:** settings-local `localizeError(e)` passes through any message lacking "fail/error" (e.g. `Title required`, `Customer name is required.`-style sentences) to `setSellerError` → rendered in seller-profile UI. One call site, user-facing config surface. Root fix: delete the shadow, route through shared helper with the settings code map.
- Notification-engine titles (F-05) are created in English at event time (no user language context at creation in current design) — fixing requires key-based titles resolved at render in `NotificationItem`, i.e. a small data-model-compatible change (store `titleKey + params`), explicitly flagged as the only fix touching more than presentation wiring.
- Backend messages reaching UI raw: only via F-01/F-09/F-10 paths. Everywhere else: generic localized fallback + console diagnostics. **PARTIAL** (architecture good, three leak paths open).

---

## 10. Test execution table (exact commands, all on current HEAD)

| # | Command | Outcome |
|---|---|---|
| 1 | `npx tsx scripts/check-i18n-parity.ts` | **PASS** — 60 dicts, no fallback hacks |
| 2 | `npx tsc --noEmit` (frontend) | **PASS** — 0 src/app/e2e errors (only pre-existing `.next/*-ABDOU` generated conflicts) |
| 3 | `npx tsc --noEmit` (backend) | **PASS** — 0 errors (incl. qa-server change) |
| 4 | `npx tsx test-compact-number.ts` / `test-date-format.ts` | **PASS** |
| 5 | `npx playwright test --config=playwright.i18n.config.ts --reporter=list` | **6/6 PASS** (33–52s; several consecutive runs) |
| 6 | `npx playwright test --config=playwright.config.ts e2e/i18n-localization.spec.ts` (official path, own backend+frontend) | **6/6 PASS ×2 consecutive** (57s, 60s) — also proves `launchTimeout` fix end-to-end |
| 7 | `npm run build` | **PASS** — all routes prerendered |
| 8 | `npx eslint src/lib/i18n.ts scripts/check-i18n-parity.ts e2e/i18n-localization.spec.ts` | new files clean; `capture-i18n-evidence.ts:10` `any` error + checker unused-var warning noted (QA scripts only, build unaffected) |
| 9 | Dexie-verified persistence flow (fr→reload→fr→ar→reload→ar→en, Dexie read per step) | **PASS** — Dexie matches document at every step |
| 10 | Document-write trap (all `lang`/`dir` writes with stacks) + 20s `ar\|rtl` sampling | **PASS** — paired writes only, converge correctly, zero flips |
| 11 | `Intl` locale spot-checks (en/fr/ar numbers + dates) | **PASS** — grouping correct, Latin digits in ar |

Browser flows verified live: EN→FR→AR→EN with `lang`/`dir` asserts; 8 routes × 3 langs titles; RTL + date-picker chrome fr+ar; invoice bidi; reload persistence; translated validation (French message asserted present, English absent).

---

## 11. Fresh browser evidence and screenshot locations

- `H.S.H-V2.0.0/frontend/re-audit-evidence/reaudit-ar-dashboard.png` — full Arabic RTL dashboard (مذبح حبريح للدواجن, مبيعات اليوم, إجراءات سريعة, date الثلاثاء، 10 نوفمبر 2026), nav dock right side, Latin digits, `DA`.
- `.../reaudit-fr-settings.png` — full French settings (Paramètres, Accueil breadcrumb, Langue/Français, French date).
- `.../reaudit-fr-invoice.png` — full French invoice (Facture, Créer une Facture, Aperçu Facture, French labels/placeholders).
- `.../e2e/evidence/ar-dashboard.png` (prior mission artifact, still on disk).
- Note: Playwright wipes `test-results/` each run (traces/videos of passing runs are not retained); failure traces were inspected live during the audit. `/sales` pixel capture blanks intermittently in headless Chromium despite correct DOM/layout/hit-testing and passing interactive assertions — documented capture-environment quirk, not an app defect (RTL test asserts the live calendar instead).

---

## 12. Reproduced defects

F-01…F-14 in §5 (+ 4 aria-label sites + 3 CSS RTL minors in §5/§7), each verified by direct source read with file:line. Strongest three: F-01 (error leak contradicting a prior explicit claim), F-02 (entire orders table untranslated), F-05 (notification titles untranslatable by design).

---

## 13. Unresolved or unverified risks

1. **Transient ar→fr on `/invoice` (prior report §11): UNRESOLVED-leaning-fixed.** Root-cause mechanism (mount-clobber + hydration-window splits) was proven via write-trap on the pre-fix pattern and is fixed+verified in HEAD (gates, paired writes, 20s stable sampling, Dexie-verified flows). One historical observation (fr over saved ar across a 30s poll) was never reproduced in ~15 targeted attempts. A sync-pull-behind path on long-lived shared backends remains theoretically possible but unproven; no code change made (production sync behavior out of scope). Recommended: canonical-wins guard on settings bootstrap/pull as follow-up.
2. **Test isolation vs shared backend:** Playwright contexts are isolated per test (fresh profile/IndexedDB), but all runs in this audit shared one long-lived QA backend (accumulated revisions). Official config boots a fresh backend per run (verified working twice) — recommend it as the standard path.
3. **RVB-mobile:** not re-audited (out of scope, untouched).
4. **`useLanguage`-style reactivity:** HSH uses per-page state + events (no context staleness found); bare `document.dir` readers in bells sample at render (fine for event-driven rows).

---

## 14. Regression and scope findings

- **R.V.B-mobile:** zero modified files (only pre-existing untracked binary asset committed — no code/config/translation change). **No cross-app impact.**
- **Backend:** exactly one file changed (`qa-server.ts`, startup timeout only). No routes, models, AuthN/Z, roles, or sync-protocol changes.
- **Frontend services:** `printing.service.ts` change is additive (`APP_PDF_LABELS` + compat alias) and presentation-only; `money.ts`/`compact-number.ts`/`date-format.ts` math untouched (verified signatures/logic); repositories, sync engine, auth contexts, invoice generation, CRUD flows untouched by diff inspection (`git show --stat`: 71 files, all UI/i18n/test/report).
- **Navigation/access:** no route guards, roles, or middleware touched (`proxy.ts` untouched).
- Production build green; tsc green both packages. (Not a substitute for workflow tests — stated explicitly; no workflow regressions found by inspection.)

---

## 15. Prioritized corrective work

1. **F-01** — delete settings-local `localizeError`, route `setSellerError` through shared helper + settings code map. (30 min)
2. **F-02** — key the rvb/orders table/drawer/buttons/statuses (`t.table.*`, reuse `t.close`, map statuses via existing `statuses` pattern from requests page). (2–3 h)
3. **F-05** — key-based notification titles resolved at render (`titleKey + params` in `notificationService.create`, `NotificationItem` resolves via `notifLabel`-style map). Only item touching creation logic; keep payload compatible. (half day)
4. **F-03, F-04, F-06** — key remaining rvb/workers, rvb/chats display names, rvb/settings strings. (half day)
5. **F-07** — key HSH About section or explicitly designate brand/static copy. (1 h)
6. **F-08…F-14 + aria sites + CSS minors** — key/replace; switch `StyledSelect` placeholder to `EMPTY_LABEL`-style default; replace `"Invoice"/"DRAFT"` fallbacks with `t.*`. (half day)
7. **F-09/F-10** — route `UniverWrapper` + print-preview catches through `localizeError` with new keys. (1 h)
8. **Follow-ups (non-blocking):** canonical-wins guard for settings sync bootstrap/pull; align `qa:i18n` script with `playwright.i18n.config.ts` (or document both paths); fix QA-script lint nits; shared `Loading/ErrorState` `common.*` defaults.
9. Re-run: parity + tsc + build + official-config Playwright (fresh backend) + fresh screenshots.

Estimated total: 2–3 focused days. No architecture changes required.

---

## Verdict

### C. NOT READY

HSH's i18n foundation is genuinely solid — one canonical Dexie source, paired document updates, gated mounts, coherent hints, locale-correct formatting with business math provably separated, dominant logical-property RTL, and a green 6/6 browser suite on committed code via two configs. But "ready" requires no known blocking defects, and this audit reproduces user-facing English in the RVB orders table, worker review flows, chat names, notification titles, settings seller errors, and the About section — several explicitly contradicting the prior report's fixed-claims. Those are enumerated above with file:line evidence and a 2–3 day repair list. Fix F-01…F-08, re-run the official suite on a fresh backend, and this flips to READY.

*Independent re-audit complete. No source files modified. New artifacts: this report + `re-audit-evidence/` (3 screenshots). Prior reports and tests left untouched.*
