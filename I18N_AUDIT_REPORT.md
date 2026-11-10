# I18N Audit Report — H.S.H & R.V.B

**Date:** 2026-11-08 (UTC)
**Scope:** `H.S.H-V2.0.0/frontend` (Next.js web) + `R.V.B-mobile` (Expo React Native)
**Mode:** READ-ONLY audit. No source files modified.
**Method:** Static source inspection (`read`/`grep`/`glob`), JSON key diff via `node`, no running-browser test executed.

---

## 1. Executive summary

The two apps do **not** share translation resources. They implement localization independently with different architectures:

- **HSH web:** No i18n library (`next-intl`, `react-i18next` absent — verified by grep, `package.json` has zero i18n deps). Each route defines its own inline `const TRANSLATIONS = { en, fr, ar }` + `const t = TRANSLATIONS[language]`. Language state lives in Dexie-backed `Settings.language` + CustomEvent propagation (`hebrih-settings-change`, `rvb-ui-preferences-change`). RTL via `document.documentElement.dir` + mixed logical properties / `html[dir=rtl]` overrides.
- **RVB-mobile:** No i18n library (`i18next`, `expo-localization`, `I18nManager` absent — verified 0 matches). Single shared dictionary `src/i18n/locales/{en,fr,ar}.json` (98 leaf keys each, verified identical key sets) + custom `t(key, fallback)` + `useLanguage()` (zustand + `useSyncExternalStore`). RTL via manual `flexDirection: row-reverse` / `textAlign: right`.

**Core switching symptom explained:**

- HSH: switching *does* propagate (events + `document.lang/dir` flip), but many strings bypass the dictionary (hardcoded aria-labels, chart legend/tooltip, date-picker chrome, `StyledSelect` empty state, backend `err.message` passthrough, `(t as any).x || "English"` fallbacks for keys missing from the typed dict). Result: page chrome translates, islands stay English.
- RVB-mobile: only 7 screens consume `t()` (~94 call sites). ~20 profile/detail screens, 4 role dashboards, onboarding, change-password, main/secondary-chats, notifications, and all shared `Loading/ErrorState/Empty/SearchField` defaults contain **zero** `t()` calls — fully hardcoded English. Switching language correctly flips the 7 wired screens + layout direction where `useLanguage()` is used, but leaves the majority of the app in English. Bare `isRTL()` / `getCurrentLanguage()` readers are non-reactive, so direction can also lag until re-render/navigation.

**Verified totals (only counted claims):**

- Components/routes inspected: HSH ~30 `app/**/page.tsx` routes + `src/components/{layout,dashboard,invoice,notifications,common,rvb,settings}` + `src/lib/*`; RVB-mobile 7 `t()`-wired screens + ~25 zero-`t()` screens + 4 dashboards + 14 common components + `src/utils/*`. Exact per-file lists in §3–§5.
- HSH routes with **no** `en/fr/ar` dict block: 5 (`about`, `online`, `notifications`, `purchases/new`, `tasks/finished`) — verified by `node` walk. `about`/`online`/`tasks/finished`/`purchases/new` are redirects (by design); `notifications` is a real gap (inline `t(en,fr,ar)` for 3 strings only + hardcoded `Loading...`).
- RVB-mobile dictionaries: `en:98 / fr:98 / ar:98` leaf keys, 9 namespaces, 0 missing, 0 empty (verified JSON diff). `fr==en`: 6 (all `@tag`/`@abattoire`/`Photo`/`ID`/`Tag` codes); `ar==en`: 3 (same `@tag` codes). No stale English sentences in `fr`/`ar`.
- RVB-mobile `t()` coverage: 94 matches in exactly 7 files; 0 missing keys (every used key exists). ~25 screens + 4 dashboards + common components have 0 `t()` calls (verified grep `useLanguage` hits only 8 files).
- Hardcoded text occurrences: HSH ~40+ sampled instances (each cited with file:line); RVB-mobile 100+ (60+ `Alert`, 44 `Button title=`, 118 `Loading/ErrorState/Empty` literal props sampled via grep; every profile screen 10–30 each).
- RTL layout defects: HSH 6 verified (sidebar `text-align:left`, date-picker chevrons, `FormalInvoiceDocument` hardcoded `textAlign:right`, asymmetric physical margins in `payments/purchases/sales`, `about` padding-left, unmirrored chart axes); RVB-mobile 8+ verified (badge `right:-6`, `Input` show-btn `marginLeft`, `AppHeader` double-margin, composer + 4 row types missing `row-reverse`, dashboard physical-margin branches, bare-`isRTL()` non-reactivity in ~20 files).
- Language-persistence defects: 2 verified flash windows (HSH first-paint `lang=en dir=ltr` + anonymous RVB `en` until hydrate/bootstrap), plus HSH login-overwrite-by-design and RVB settings-mirror lag. No data-loss defects found.
- Shared infrastructure defects: 0 shared (architectures independent). Defects are per-app; patterns rhyme (backend passthrough, hardcoded a11y, fixed `fr` locale for numbers) but code is not shared.
- No browser-executed test. All findings static.

---

## 2. Existing i18n architecture

### 2.1 HSH web (`H.S.H-V2.0.0/frontend`)

No `[locale]` segment, no `middleware` locale detection, `next.config.ts:1-7` has zero i18n config.

| Concern | Implementation | Evidence |
|---|---|---|
| Type | `type Language = "ar" \| "fr" \| "en"` | `src/types/settings/settings.ts:1` |
| Defaults/helpers | `DEFAULT_SETTINGS.language = "en"`, `getDirection(lang) => ar?rtl:ltr`, `getLanguageName()` | `src/lib/settings.ts:112-113,147-149` |
| Dictionaries | Inline per-page `const TRANSLATIONS = { en:{...}, fr:{...}, ar:{...} }`; RVB subpages use `const TR: Record<Language,any>`; invoice doc uses `DOC_T`; office uses `T`/`EDITOR_T`/`SHEET_T` | `app/settings/page.tsx:69`, `app/customers/page.tsx:274`, `app/rvb/settings/page.tsx:19`, `src/components/invoice/FormalInvoiceDocument.tsx:10` |
| Consumption | `const t = TRANSLATIONS[language]` (no per-key fallback); RVB `const t = TR[lang] ?? TR.en` | `app/customers/page.tsx:514`, `app/rvb/accounts/page.tsx:288-289` |
| State | Per-page `language` state + `AppShell`/`RvbShell` `settings` state; no React Context | `src/components/layout/AppShell.tsx:432-433`, `src/components/rvb/RvbShell.tsx:236` |
| Persistence | Canonical Dexie `settings` table (`settings.repository.ts:6,16-56`) via `settings.service.ts:37-43,51-91`; `localStorage` mirror `rvb-ui-navigation-style` (nav only, never language value); RVB account `ui.language` via `rvb-ui-preferences.service.ts:19,29-43,114-149` + `rvb-ui-language` localStorage fallback | See paths |
| Switchers | Two `StyledSelect` instances only (no reusable component): HSH `app/settings/page.tsx:889-910,1123-1133` + confirm modal `712-732`; RVB `app/rvb/settings/page.tsx:520-528,319-353` | See paths |
| Propagation | `publishSettings()` → `CustomEvent(hebrih-settings-change)` + `rvb-ui-preferences-change` (`src/lib/settings.ts:97-110`); 15+ HSH pages + both shells subscribe; `storage` event for cross-tab | `app/customers/page.tsx:538`, `AppShell.tsx:527-529` |
| Document lang/dir | Set in 7+ places, always paired `document.documentElement.lang/dir` | `AppShell.tsx:481-482,494-495`, `RvbShell.tsx:267-268`, `app/settings/page.tsx:575-576` |
| Static fallback | `<html lang="en" dir="ltr">` | `app/layout.tsx:20` |
| Per-doc direction | Invoice paper uses **document language**, not UI language | `FormalInvoiceDocument.tsx:183-185,205` |
| Formatting | `ar-DZ-u-nu-latn` forced Latin digits; display `DD/MM/YYYY` locale-independent | `src/lib/datetime.ts:1-3`, `src/lib/date-format.ts:1-12`, `StyledDatePicker.tsx:224,235` |

### 2.2 RVB-mobile (`R.V.B-mobile`)

No `I18nManager`/`expo-localization` (grep 0 matches). No `AsyncStorage`/`MMKV` (grep 0 matches).

| Concern | Implementation | Evidence |
|---|---|---|
| Dictionaries | `src/i18n/locales/en.json`, `fr.json`, `ar.json` (98 leaves each) | `src/i18n/index.ts:3-5,7` |
| API | `t(key, fallback)` dot-walk + `getCurrentLanguage()` + `isRTL()` + `useLanguage()` | `src/i18n/index.ts:11-69` |
| Precedence | account `preferences.ui.language` → pre-login `rvb.preLoginLanguage` → `"en"` | `src/i18n/index.ts:18-22` |
| Pre-login store | `useSyncExternalStore` + `localStorage` (web) / `SecureStore` (native), key `rvb.preLoginLanguage` | `src/i18n/pre-login-language.ts:6,35-58,78-90` |
| Auth store | `bootstrap()` restores account (language authoritative); `logout()` clears account but **not** pre-login key | `src/stores/auth-store.ts:42-150,208-240` |
| Switchers | Login pills (pre-login) `app/(auth)/login.tsx:118-151`; Settings pills (PATCH `/preferences` + optimistic `setAccount` + `GET /me`) `app/(app)/(tabs)/settings/index.tsx:35-52,99-108` | See paths |
| RTL | Manual `rtl && {flexDirection:"row-reverse"}` + `textAlign: rtl?"right":"left"`; chevron flip `chevron-forward/back`; bubble rows intentionally not reversed | `AppHeader.tsx:14-15`, `ListRow.tsx:10`, `chat/[id].tsx:776,906-907,1110,1268` |
| Dates/numbers | `Intl.DateTimeFormat(lang)` in chat + `utils/date.ts`; `utils/currency.ts` fixed `fr-DZ`/`fr-FR`, `pdf*.ts` fixed `fr-FR` | `utils/date.ts:12-35`, `utils/currency.ts:6,9` |

HSH and RVB share **nothing**: separate dicts, separate persistence, separate RTL strategy, separate switchers.

---

## 3. HSH findings

Severity: Critical = wrong-language PII/financial doc or total untranslation of a route; High = visible English island on a translated page or RTL break; Medium = a11y/placeholder/tooltip or fallback English; Low = console/symmetric CSS.

| # | Route | Component | Issue | Sev | Root cause | Evidence | Fix |
|---|---|---|---|---|---|---|---|
| H1 | `/notifications` | `app/notifications/page.tsx` | No `TRANSLATIONS`; only 3 strings via inline `t(en,fr,ar)`; `Loading...` hardcoded | High | Route never given a dict; empty-state relies on `notifLabel` but loading path missed | `page.tsx:189` inline `t`, `:235,238,248,270`, `:280` `<p>Loading...</p>` | Add `TRANSLATIONS{loading}` or reuse `notifLabel`; wire `loading` to `settings.language` |
| H2 | `/` (home) | `app/page.tsx:436` | Backend/error fallback `"Failed to load"` displayed raw | Med | `setOverviewError(err.message ? ... : "Failed to load")` — backend English passthrough | `:436` | Map to `translations[lang].failedLoad` |
| H3 | `/` | `app/page.tsx:647,661,739,757` + `:690,700,710` + `:945` + `:612,631` | `aria-label` (`Open menu`, `Toggle theme`, `Select period`), `Loading…`, `Invalid financial value…/Data integrity`, `themeLabel` hardcoded | Med | A11y/loading strings never added to `translations` (which otherwise has ~55-68 keys `:110-278`) | Lines cited | Extend dict with `openMenu/closeMenu/toggleTheme/loading/invalidValue`; pass through `FloatingNav` props |
| H4 | `/office` | `app/office/page.tsx:223-238,620,622,740-742,748,771` | Template bodies, `xls`/`unsupported type` toasts, selector labels, `(t as any).close ?? "Close"` outside `T` (57 keys `:45-217`) | Med | Inline ternaries + missing `close` key | Lines cited | Add `close/xlsUnsupported/unsupportedType/selector*` to `T`; route `setToast` through dict |
| H5 | `/tasks` | `app/tasks/page.tsx:1020` | `Confirm deletion` hardcoded during countdown | Med | Countdown-waiting branch ignores `t.confirmDelete` | `:1020` | Use `t.confirmDelete` in both branches |
| H6 | `/invoice` | `app/invoice/page.tsx:1016-1065,1290,1680-1859` | `(t as any).drafts/noDrafts/editDraft/deleteDraft/currency/*NotFound/*Required/*Invalid || "English"` | High | Keys missing from typed `TRANSLATIONS`; `TRANSLATIONS[language]` has no per-key fallback so authors patched with `\|\|` English | Lines cited | Add missing keys to all 3 langs; add `TRANSLATIONS[lang] ?? TRANSLATIONS.en` per-key helper |
| H7 | `/reports` | `app/reports/page.tsx:550,568` | `Transfer` prefix hardcoded | Low | `formatCurrency` line bypasses `t` | `:550,568` | Add `t.transfer` |
| H8 | `/settings` | `TagListEditor` `app/settings/page.tsx:1666,1693,1705` + `:1373,2289` | `Delete`, `Close`, `Loading settings...` hardcoded | Med | Generic editor not given translated props | Lines cited | Pass `t.delete/close/loading` into editor |
| H9 | all HSH | `BusinessOverviewChart.tsx:141,146,149,215,218,225,233,236,242` | Legend/tooltip/aria (`Sales/Purchases/Business overview…`) English-only | High | `language` prop only used for `ChartError` + `formatTooltipDate`; chart chrome ignores it | Lines cited | Add `chartSales/chartPurchases` to home dict; derive legend/tooltip/aria from `t` |
| H10 | all HSH | `StyledDatePicker.tsx:368,397,404,408,415,422,426,433,436` | Calendar chrome (`Open calendar`, `Previous/Next month/year`, `Choose month/year`) hardcoded | High | No `language` branch for nav buttons; month/year labels are translated but chrome is not | Lines cited | Extend dict or `DOC_T`-style map for chrome |
| H11 | all HSH | `StyledSelect.tsx:264` | `No options` hardcoded | Med | No `language` prop | `:264` | Add `language` prop + `noOptions` key |
| H12 | `/rvb/*`, HSH shells | `DirectoryPicker.tsx:56,62,68,70`; `RvbShell.tsx:67-78,692,769-770,787-788,847,851,864,879`; `CompactHeader.tsx:55-56,69-70`; `ClassicSidebar.tsx:233`; `AppShell.tsx:82,740,754` | `Search by name…`, `Loading…`, `No accounts found`, `RVB Dashboard/Accounts & Access…`, `Close menu/Sign Out/Switch to light mode`, `Settings`, `Hebrih logo`, fallback nav labels | High (user-facing), Med (a11y) | Components predate dict or never wired; English defaults in `RvbRoleOverviewCard:14` (`Active/Archived`) same pattern | Lines cited | Wire `language` prop + dict keys; replace `RVB_NAVIGATION` labels with `translations` |
| H13 | `/office/doc/[id]`, `/office/sheet/[id]` | Inline ternaries outside `EDITOR_T`/`SHEET_T` | `Start typing…`, `Untitled`, `Image too large`, `No data/Sheet 1`, header `Phone…` translated but not in dict | Low | Works but unmaintainable; `(TM as any).vehicle ?? "Vehicle"` proves gaps | `document/[id]:117,336,264-284`; `spreadsheet/[id]:138,176,265-304,391,446-453` | Consolidate into dict |
| H14 | `/customers` `/invoice` `/settings` placeholders | `SARL`, `INV-001`, `https://…`, `TVA 19%` | Example values left English/French-only | Low | Placeholder examples not internationalized (acceptable for codes, but `SARL`/`TVA` are locale-specific) | `customers:1158`, `invoice:1756`, `settings:2631,2660` | Use locale-neutral examples or per-lang placeholders |
| H15 | All forms | `setError(err.message)` / `setToast(e.message)` | Backend English surfaces verbatim (`Customer name is required`, `PAYMENT_METHOD_INVALID`, …); `customers:741` comment admits it | High | Services throw English; UI has no error-code → `t` map | `page.tsx:436`, `customers:557,741-742`, `payments:578-731`, `invoice:1229,1246`, `office:512-550`, `tasks:643-726`, `settings:2175` | Introduce error-code map; never render `err.message` directly |
| H16 | `dashboard-overview.ts:80,127` | Axis labels `Mon…Sun`, `Jan…` | Chart X labels stay English in `fr`/`ar` | Med | Hardcoded arrays; only tooltips go through `localeFor()` | `:80,127` vs `:186` | Localize arrays per `language` |
| H17 | `amountInWords`, `notification-presentation` | — | **No issue** (verified trilingual) | — | — | `amountInWords.ts:9-157`, `notification-presentation.ts:179-206` | Keep as reference pattern |

Redirects (`about`, `online`, `purchases/new`, `tasks/finished`) verified `redirect()`/`router.replace()` with no UI — not issues.

---

## 4. RVB findings

Dictionary health is good (98/98/98, §1); coverage is the problem. Only 7 files call `t()`.

| # | Route | Component | Issue | Sev | Root cause | Evidence | Fix |
|---|---|---|---|---|---|---|---|
| R1 | `(auth)/onboarding` | `onboarding.tsx:68-94` | Entire screen English (`Welcome to R.V.B`, `Gallery/Camera`, `Complete onboarding`, errors `:40,49,54,61`) | Critical | 0 `t()` calls; no `useLanguage` import | Lines cited | Add `onboarding.*` namespace + wire `useLanguage()` |
| R2 | `(auth)/change-password` | `change-password.tsx:23-58` | All labels/validation English (`Change Password`, `Current password is required`, `must be at least 8 characters`) | High | 0 `t()` calls | Lines cited | Add `password.*`/`changePassword.*` keys |
| R3 | `(tabs)/main-chats`, `secondary-chats`, `notifications`, `search` (partial) | 4 screens | Headers/empty/loading/search/Alerts English (`Loading main chats…`, `Could not load chats`, `No secondary chats`, `Mark Read/Unread/Archive`, `Searching…`, `Secondary Chats`, `+ New`, `New Group`, `Select members…`, chips `All/worker/…`) | Critical | Bare `isRTL()` + `getCurrentLanguage()` for layout/date only; labels never mapped. `search` has 2/12 strings wired | `main-chats:34,57-58,80,105,125`; `secondary-chats:40,87,91,106-107,118-119,130,141,144,157,160,174,178-179,188`; `notifications:59,104,124-125,132-133,136,142-157,163,171,197,205`; `search:45,70,73,83,88,99,106,110,128` | Add `mainChats.*`, `secondaryChats.*`, `notifications.*`, extend `search.*`; replace literals with `t(key, fallback)` |
| R4 | `profile/*` (20 screens) | `accounts, workers, suppliers, customers, orders, payment, loan, requests, requests-management, supply, insert-shipment, place-order, customer/supplier-requests/discrepancy, activity, notifications(re-export), +not-found` + `_layout.tsx:37-56` headers | 10–30 hardcoded strings each (titles, `Name *`, `Phone *`, `Starting Salary`, `Search name or phone`, validation, `Loading workers…`, `No orders yet`, Alert titles `Failed/Invalid/Success`) | Critical | 0 `t()` in every file; native header `title: "Payment Request"/"Loan Application"/…` + `headerBackTitle:"Back"` untranslated | `accounts:156,192-193,201-202,240-241`; `workers:159,189-193`; `payment:84-85`; `loan:84-85`; `discrepancy:59`; `_layout:37-56` | Add per-domain namespaces (`accounts.*`, `workers.*`, …); wire headers via `useLanguage()` |
| R5 | dashboards | `Worker/Supplier/Customer/ManagementDashboard` | 30–60 hardcoded strings each (`Summary`, `Current Credit`, `Monthly Salary`, `Worker Actions`, `Payment Request`, `Under Review/Accepted/Rejected`, `My Worker Profile`, `Quick Stats`, PDF HTML `Worker Information/Name/Position…`, `No bonuses recorded.`) | Critical | 0 `t()`; `lang = getCurrentLanguage()` snapshot for dates only; `formatRole()` capitalizes English | `Worker:92-101,135-195,271-361`; `Supplier:91-133,156-226`; `Customer:104-170,221-251`; `Management:38-107,269,380` | Add `dashboard.*` namespaces; PDF template per-`lang` |
| R6 | `chat/[id]` | Alerts/fallbacks | ~15 untranslated (`Failed/Could not load older messages/Send failed/Invalid/Content required/Expired/Edit window…`, `:394` permission sentence, `:336` fallback, `:119` `[Media]`) | High | Screen is 50× `t()`-wired for bubbles, but `Alert.alert()` titles + catch paths use literals; only `common.error/close` wired | `chat/[id].tsx:275,300,336,394,528,536,541,550,568,582,672,717` | Add `conversation.alert*` keys; map `Alert` titles |
| R7 | `settings` | `settings/index.tsx:50,109,117,121,126-128,134` | `Failed to update language`, `UI updates immediately…`, theme names `Light/Dark/System` (capitalized English), `Current: …`, `Poultry Business Suite / R.V.B Mobile • v1.0.0`, `Build: …` | Med | 10/16 strings wired; hints/about hardcoded | Lines cited | Add `settings.hint/about/build/theme*` |
| R8 | shared | `Loading.tsx:5`, `ErrorState.tsx:6,21`, `Empty.tsx:5`, `SearchField.tsx:6`, `Input` placeholders, `ListRow` | Defaults English (`Loading…`, `Something went wrong`, `Retry`, `No data`, `Search…`) + every call site passes English literals | High | Defaults have no `language` path; 118 `Loading/ErrorState/Empty` literal props | Paths cited + `workers:240,244` etc. | Give shared components `useLanguage()` defaults (`common.loading/retry/error…`); replace call-site literals |
| R9 | dates/numbers | `utils/date.ts`, `utils/currency.ts`, `utils/pdf*.ts`, hardcoded `"en"` call sites | `currency` fixed `fr-DZ`/`fr-FR`; PDF dates fixed `fr-FR`; `formatDateTime(x,"en")` in `workers:240,244,248`, `customers:190`, `suppliers:181` ignores user lang | High | Locale not threaded from `useLanguage().lang` | `currency.ts:6,9`, `pdf:24,26,28`, call sites cited | Thread `lang`; `Intl(lang==="ar"?"ar-DZ-u-nu-latn":…)` |
| R10 | backend passthrough | All screens/stores | `Alert.alert("Failed", e?.message)`, `ErrorState message={error}`, `setError(e.message \|\| "Failed…")` — backend English reaches UI | High | No error-code → `t` map; only 3 chat sends use `t(common.error)` | `login:88,91`, `[id]:275,477,528,657`, `main-chats:34`, `Worker:92-101`, `auth-store:148,202,292` | Map `RVB_*`/HTTP codes to `login.*`/`common.*` keys |
| R11 | dead keys | `auth.*(5)`, `tabs.mainChats/secondaryChats`, `conversation.photoVideo/retry/imageAttachment/photo/video/justNow`, `common.loading/retry/save/cancel` | Unused but present (not a bug; proves dict ahead of wiring) | Low | Screens never call them | Grep 0 code hits | Wire or remove after R3–R5 |

---

## 5. Arabic RTL findings

### 5.1 HSH web

Document direction itself is correct: `getDirection()` (`settings.ts:147-149`), paired `lang/dir` writes in shells + settings pages, per-invoice `dir={getDirection(docLang)}` (`FormalInvoiceDocument.tsx:185,205`) independent of UI language — good. Static `<html lang="en" dir="ltr">` (`layout.tsx:20`) flashes LTR on cold boot until effects run (§6).

**Correct patterns (keep):** logical `margin-inline/padding-inline/inset-inline/text-align:start|end` (`ThemeAppearanceSelector:34,147,157`, `CompactHeader:177,198`, `FloatingNav:185`, `NotificationBell:86,104`, `StyledSelect:24`, `StyledDatePicker:23`, `page.module:59,154,199,526`), `html[dir=rtl]` overrides (`accounts:1054,1170-1171`, `customers:404,1047`), countdown `direction:ltr` isolation (`ProtectedDeleteModal:244-254`), `@tag dir="ltr"` (`DirectoryPicker:82`), Latin digits forced (`datetime.ts:2-3`, `dashboard-overview:186`, `FormalInvoiceDocument:164`).

| # | Defect | Sev | Evidence | Fix |
|---|---|---|---|---|
| RTL-H1 | Sidebar labels `text-align: left` stay left in RTL (container uses `border-inline-end`, so one line breaks alignment) | High | `app/page.module.css:354` | `text-align: start` |
| RTL-H2 | Date-picker prev/next chevrons never flip (`ChevronLeft`=prev always) | High | `StyledDatePicker.tsx:5,397-398,408-409,415-416,426-427` | Branch on `language==="ar"` or `dir`; swap icons + aria |
| RTL-H3 | Seller RC/NIF block `textAlign:"right"` hardcoded — right in `en`/`fr` docs, coincidentally right in `ar` | Med | `FormalInvoiceDocument.tsx:264` (inside `dir={dir}` `:205`) | `textAlign:"end"` |
| RTL-H4 | Asymmetric physical margins copied across domains (`margin-right:auto`, `margin-left:auto`, `left:auto;right:0`) | High | `payments:1622-1639,2029-2030`, `purchases:1484-1501,1892-1893`, `purchases/new:1203-1229,221-222`, `purchases/entry:1234-1260,221-222`, `sales:1466-1483,1806-1807`, `page.tsx:761 right:0` | `margin-inline-*` / `inset-inline-*` |
| RTL-H5 | `about/page.module.css:86 padding-left:18px` (only such hit in `src`+`app`) | Low | Line cited | `padding-inline-start` |
| RTL-H6 | Invoice phones/emails/RC/NIF/RIB/numbers inside RTL `div` with no `bdi`/`dir="ltr"` isolation — bidi reorder risk | High | `FormalInvoiceDocument.tsx:260-261,318-319,331` | Wrap identifiers in `<bdi dir="ltr">` |
| RTL-H7 | Chart geometry LTR-only (`padding{left:52,right:12}`, `xFor` left→right, y-axis left, tooltip `translate(-50%,-100%)` centered-safe) | Med | `BusinessOverviewChart.tsx:37` + module `:96` | Mirror axes when `language==="ar"` or document the LTR-chart decision |
| RTL-H8 | Toast centering `left:50% + translateX(-50%)` (4 hits) + symmetric `left:0;right:0` overlays — visually safe, physical | Low | `office/page.tsx:795`, `office/doc:440`, `office/sheet:307`, `reports:734`; `customers:359-360,1000-1001` etc. | `left:50%` acceptable; prefer `inset-inline:0;margin-inline:auto` for overlays |

`FloatingNav` free-dock `left/top` (`FloatingNav.tsx:874-875,1331`, CSS `:15-16`) is viewport geometry, not an RTL bug.

### 5.2 RVB-mobile

No `I18nManager` (verified 0 matches) — RTL is pure JS, no native mirror, no restart. Correct: `row-reverse` on header/rows (`AppHeader:14-15`, `ListRow:10`, `chats:24`), `textAlign right` on inputs (`login:158,175`, `chat:1268`), chevron flip (`AppHeader:18`, `chat:776`), bubble rows intentionally semantic (`chat:906-907`).

| # | Defect | Sev | Evidence | Fix |
|---|---|---|---|---|
| RTL-R1 | `AppHeader` double-margin (`marginLeft:8` always + `marginRight:8` in RTL) | Med | `AppHeader.tsx:21` | `marginStart/marginEnd` or `gap` |
| RTL-R2 | `Input` Show/Hide `marginLeft:8` stays left-padded in RTL | Low | `Input.tsx:229` | `marginStart:8` |
| RTL-R3 | `NotificationBell` badge `right:-6` pinned top-right in AR | Med | `NotificationBell.tsx:53` | `rtl ? {left:-6} : {right:-6}` (RN has no `insetInlineEnd`) |
| RTL-R4 | Composer order not mirrored (attach/input/send stay LTR); only input `textAlign` + send `scaleX:-1` flip. Contradicts release-report claim of `row-reverse` fix | High | `chat/[id].tsx:1676` base `flexDirection:"row"`; usage `:1241` has no `rtl` branch; same for `:1097,1375`, header `:779-782`, meta `:1657-1667` | Add `rtl && {flexDirection:"row-reverse"}` to `composer` + header/meta rows (keep bubble-row exception) |
| RTL-R5 | Notifications header/bulk/filter rows + search chips lack `row-reverse` (inconsistent with `chats:24` which has it) | Med | `notifications:130,140,155`, `search:85` | Add `rtl` branch |
| RTL-R6 | Dashboard `marginLeft:12` + RTL override branches work but physical; `detailValue textAlign:right` base + `left` override — fragile | Low | `Worker:404/174`, `Management:118/58`, `Supplier:292/146`, `Customer:321/155`, `ListRow:22/12` | `marginStart:12`; keep `textAlign` branch (RN has no logical `textAlign`) |
| RTL-R7 | Bare `isRTL()`/`getCurrentLanguage()` non-reactive in ~20 files — direction frozen until parent re-render/navigation/pull-to-refresh (self-admitted in `PHASE3-WORKER-REPORT:190`) | High | `AppHeader:6,12`, `Worker:14,29,48,121-122`, `Management:11,21`, `Supplier:14,24,43,106`, `Customer:14,39,57,117`, `ListRow:4,8`, `search:14,21`, `main-chats:13,18-19`, `notifications:13,40-41`, `secondary:16,20`, ~15 `profile/*` | Convert to `useLanguage().isRTL/lang` |
| RTL-R8 | Stack animation `slide_from_right` hardcoded LTR | Low | `app/(app)/_layout.tsx:11-22` | Mirror animation when `isRTL()` or document decision |
| RTL-R9 | `@tag`/phone LTR pinning correct in login (`textAlign:left` `:159`) and dashboard value-left, but no `writingDirection`/`bdi` for chat mentions/invoice PDF `esc(phone)` | Low | `login:159`, `Worker:202`, `pdf*.ts` | Add `writingDirection:"ltr"` for identifiers in RTL context |

---

## 6. Language-switching lifecycle findings

### 6.1 HSH

| Step | Behavior (verified) | Verdict |
|---|---|---|
| Select EN/FR/AR | `StyledSelect → pending → confirm modal → settingsService.save(Dexie+sync queue) → publishSettings → CustomEvents → setSettings → document.lang/dir` instant flip | Works |
| Repeat switching | Each save republishes; no cached `t()` (inline per-render `translations[settings.language]`, `AppShell:598`) | Works; zero `React.memo`, zero missing-`language` memo deps (only `StyledDatePicker`/`StyledSelect`/`BusinessOverviewChart` memos, deps correct) |
| Navigate route | Survives: shells re-init from warmed `getCachedSettings()` (no `useState(DEFAULT)` re-init found); `settingsReady` gate prevents flash | Works |
| Modals/dropdowns | Prop-drilled `language` (`HshNotificationBell/CompactHeader/WorkspaceTransition`); `ProtectedDeleteModal/CancelInvoiceModal` recompute per render; no stale closure | Works (except untranslated defaults §3) |
| Refresh | Cold: `<html en/ltr>` paints, then `loadCanonicalSettings()` (Dexie-first) → `setSettingsReady` → `lang/dir`; nav hidden until ready (`AppShell:687`) so no wrong-language flash, but LTR paint flash remains | Works with LTR flash (Low) |
| Logout/login | `RvbAuthContext:68-77,90-103` `syncFromAccount()` on `user.id`/login; account language authoritative, overwrites local; logout clears user only (language persists) | By design; document as expected |
| State reset | Language switch does not reset unrelated state (local `setSettings(next)` only; `RVB_UI_PREFERENCES_EVENT` local-only never touches cache `:503`) | Works |
| Cross-tab | `storage` event re-reads canonical Dexie (`AppShell:519-524`) | Works |

### 6.2 RVB-mobile

| Step | Behavior (verified) | Verdict |
|---|---|---|
| Select (login) | `setPreLoginLanguage` → `current` + `emit()` + persist; `useLanguage()` subscribers re-render instantly | Works for `login` screen |
| Select (settings) | Triple-write PATCH + optimistic `setAccount` + `GET /me`; `useLanguage()` subscribes to `account.preferences.ui.language` so wired screens flip instantly | Works for 7 wired screens |
| Repeat switching | Singleton stores; no memo-stale risk (0 `React.memo`/`useMemo(lang)` matches) | Works where wired |
| Navigate | `zustand` + `useSyncExternalStore` survive `expo-router` pushes; auth-gate effect keyed on `status/account`, not language | Works |
| Modals/dropdowns | No language-scoped memo; `Alert` titles hardcoded so they never flip (content bug, not closure bug) | Content gap (§4 R6/R10) |
| Refresh (anon) | `current="en"` until `hydrate()` resolves stored `ar` → one `emit()`; brief EN flash | Low flash defect |
| Refresh (auth) | `bootstrap()` restores account language; pre-login shown until then | Low flash defect |
| Logout/login | `logout()` preserves `rvb.preLoginLanguage`; `login.tsx:64-78` adopts pre-login only if account lang empty/invalid (never overwrites) | By design |
| State reset | Language switch updates `account`/`prefs` mirror only; `prefs` display mirror (`settings:101`) can lag one fetch | Low lag |
| Non-reactive screens | Bare-`isRTL()` screens (§5 RTL-R7) miss instant flip; need navigation/refresh | **High defect** |

No stale closures, cached translations, or improperly memoized components found in either app. The defect is missing wiring, not stale wiring.

---

## 7. Translation coverage matrix

### 7.1 RVB-mobile shared dict (verified via `node` JSON diff)

| Namespace | en | fr | ar | Missing fr | Missing ar | Empty | Note |
|---|---|---|---|---|---|---|---|
| `auth` (5) | 5 | 5 | 5 | 0 | 0 | 0 | `tag` = `@tag` all langs by design |
| `login` (16) | 16 | 16 | 16 | 0 | 0 | 0 | `tagLabel/tagPlaceholder` codes preserved |
| `tabs` (6) | 6 | 6 | 6 | 0 | 0 | 0 | `mainChats/secondaryChats` dead keys |
| `chats` (3) | 3 | 3 | 3 | 0 | 0 | 0 | Fully wired |
| `conversation` (43) | 43 | 43 | 43 | 0 | 0 | 0 | `photo`=`Photo` fr by design; alerts unwired |
| `settings` (9) | 9 | 9 | 9 | 0 | 0 | 0 | 10/16 screen strings wired |
| `profile` (8) | 8 | 8 | 8 | 0 | 0 | 0 | `id`/`Tag` codes by design; only GenericProfile wired |
| `search` (2) | 2 | 2 | 2 | 0 | 0 | 0 | Header only wired |
| `common` (6) | 6 | 6 | 6 | 0 | 0 | 0 | Only `error/close` used |
| **Total** | **98** | **98** | **98** | **0** | **0** | **0** | Dict complete; wiring ~25% of screens |

### 7.2 HSH per-route dict presence (verified via `node` walk for `en:/fr:/ar:` blocks)

| Route group | Dict | Status |
|---|---|---|
| `settings, accounts, customers, expenses, products, purchases, payments, sales, reports, invoice, workers, vehicles, suppliers, tasks, sales/entry, purchases/entry, office, office/print-preview, office/doc/[id], office/sheet/[id], rvb/*, page (home)` | `TRANSLATIONS`/`TR`/`T`/`translations`/`EDITOR_T`/`SHEET_T`/`DOC_T` + `SHELL_TRANSLATIONS` | Present (key parity per-key not machine-verified; `(t as any).x \|\| "English"` samples prove gaps H6/H4) |
| `about`, `online`, `purchases/new`, `tasks/finished` | none | Redirects — by design, no fix |
| `notifications` | none (inline 3-string `t` only) | **Gap H1** |

### 7.3 HSH missing-key signal (not a count — sampled proof)

`TRANSLATIONS[language]` has no per-key fallback; authors patched gaps with `|| "English"`. Each instance below is a proven missing/untyped key: `invoice drafts/noDrafts/editDraft/deleteDraft/currency/supplierNotFound/*Required/*Invalid/paymentMethodInvalid`, `office close`, `spreadsheet vehicle/task`, `settings defaultPaymentMethodId`, `reports Transfer`, `tasks Confirm deletion`.

---

## 8. Root causes ranked by severity

1. **Critical — RVB majority of app never wired to `t()`** (§4 R1–R5). 20 profile screens + 4 dashboards + onboarding/change-password + 3 tab screens render zero dictionary lookups. Cause: dict built for 7 screens; feature screens added without `useLanguage()`.
2. **Critical — HSH per-page dicts with no per-key fallback + untyped gaps** (§3 H6). `TRANSLATIONS[language]` renders `undefined` for missing keys; `|| "English"` patches hide the gap and lock English in `fr`/`ar`.
3. **High — Backend English passthrough in both apps** (HSH H15, RVB R10). `err.message` / `Alert(e.message)` displayed verbatim; no error-code map.
4. **High — RVB bare `isRTL()` non-reactivity** (RTL-R7). ~20 files read snapshots; direction flips only on parent re-render.
5. **High — HSH shared chrome untranslated** (H9–H11, H12). Chart, date-picker, select, shells, `DirectoryPicker` bypass dicts.
6. **High — RTL physical CSS/props** (RTL-H2/H4/H6, RTL-R4). Chevrons, asymmetric margins, unisolated identifiers, unmirrored composer.
7. **Medium — A11y/placeholder/tooltip gaps** (HSH H3/H8/H14, RVB R7). `aria-label`, `title`, example placeholders hardcoded.
8. **Medium — Fixed-locale numbers/dates** (RVB R9, HSH H16). `fr-DZ`/`fr-FR` hardcoded where user `lang` should select locale; HSH chart axes English-only.
9. **Low — First-paint flashes** (HSH `en/ltr` static HTML, RVB pre-login/bootstrap). No persistence loss; visual flash only.
10. **Low — Dead keys + inline-ternary debt** (RVB R11, HSH H13). Maintainability, not user-visible.

Backend vs frontend distinguished throughout: backend messages are passthrough defects (H15/R10), not missing keys. Layout defects (§5) are separate from dictionary defects (§3–§4).

---

## 9. Recommended repair sequence

Do not replace architectures. Repair inside existing patterns. Stop after audit approval before implementing.

1. **HSH safety net (1–2h):** add per-key fallback helper (`t = key => TRANSLATIONS[lang][key] ?? TRANSLATIONS.en[key]`) per page or codemod `TRANSLATIONS[language]` → `TRANSLATIONS[language] ?? TRANSLATIONS.en` + typed key audit from H6/H4 samples. Kills `undefined` renders.
2. **HSH error-code map (half-day):** stop rendering `err.message`; map service codes (`Customer name is required`, `PAYMENT_METHOD_INVALID`, …) to `TRANSLATIONS` keys. Fixes H15 across all forms.
3. **HSH shared chrome (day):** wire `BusinessOverviewChart`, `StyledDatePicker`, `StyledSelect`, `CompactHeader`, `ClassicSidebar`, `RvbShell` nav labels, `DirectoryPicker` to existing dicts (H9–H12, RTL-H1–H3).
4. **HSH RTL pass (day):** `text-align:start`, chevron branch, `margin-inline/inset-inline`, `bdi` identifiers, chart-axis decision (RTL-H1–H8).
5. **RVB wiring wave 1 (days):** add namespaces + `useLanguage()` to `main-chats`, `secondary-chats`, `notifications`, `search` remainder, `settings` hints, `chat` alerts, shared `Loading/ErrorState/Empty/SearchField` defaults (R3,R6–R8).
6. **RVB wiring wave 2 (days):** 20 profile screens + 4 dashboards + onboarding/change-password + native headers (R1,R2,R4,R5). Largest block; split per domain.
7. **RVB reactivity + RTL (day):** convert bare `isRTL()` → `useLanguage()` (RTL-R7); mirror composer/rows/badge/input (RTL-R1–R5); thread `lang` into dates/currency/PDF (R9); map backend errors (R10).
8. **Persistence polish (hours):** HSH `themeInitScript`-style language pre-paint (optional, flash only); RVB nothing structural (by-design overwrites documented).
9. **Regression suite (§10)** before/after each wave.

---

## 10. Regression testing strategy

Existing infra (verified): HSH `playwright.config.ts` + `playwright.rvb.config.ts` (chromium, `testDir ./e2e`, 16 specs) + 12 ad-hoc `tsx test-*.ts` (no runner); RVB-mobile `@playwright/test` in `devDependencies` but **no config, no test script, no `e2e/` dir** — contract checks are manual `scripts/test-*.ts` + prose reports. No Vitest/Jest/Cypress in either app. Zero dedicated i18n specs today (only `full-journey-robust:99-104` touches the switcher unasserted, `office-document:95` Arabic-content note, `02-products:19` comment).

| Goal | HSH (Playwright, extend `e2e/`) | RVB-mobile (add runner: Playwright-web or Detox/Maestro) |
|---|---|---|
| Dict completeness | `tsx` script: parse each `TRANSLATIONS`/`TR`/`T` block, assert `en/fr/ar` key parity; fail on `(t as any).x \|\| "` patterns | `node` script: assert `en/fr/ar` 98-key parity (currently passing); assert 0 `t()` keys missing; assert 0 screens without `useLanguage` (currently failing — pin R1–R5) |
| Switch reactivity | `e2e/i18n-switch.spec.ts`: EN→AR→FR→EN on `/settings`; assert `document.lang/dir`, `t.title` text, no `undefined`; repeat 3× | Mount `login` + `settings` + one dashboard: switch lang, assert labels + `row-reverse` without reload |
| RTL | Assert `.sidebarItem` computed `text-align`, date-picker chevron order, invoice `div[dir]` per `documentLanguage`, `bdi` phones, chart axis | Assert composer order, badge side, `Input` affordance side, chip rows `row-reverse` |
| Fallback | Force missing key; assert English fallback, never blank/crash | Assert `t(key, fallback)` fallback path |
| Route coverage | Loop all non-redirect routes; screenshot `ltr` vs `rtl`; assert 0 hardcoded `Loading...`/`Transfer`/`Confirm deletion` | Loop all `profile/*` + tabs; assert 0 literal `Alert("Failed"` titles |
| Persistence | Reload → assert Dexie-restored `lang/dir`; cross-tab `storage` event; logout/login authoritative overwrite | Reload anon (pre-login hydrate) + auth (bootstrap); logout preserves pre-login; login preserves account lang |
| Backend passthrough | Trigger validation error in each language; assert translated message, never raw `err.message` | Same via `Alert`/`ErrorState` |

**Do not claim browser verification:** this audit executed no browser. The suite above is proposed, not run.

---

*End of audit. Awaiting approval before fixes.*
