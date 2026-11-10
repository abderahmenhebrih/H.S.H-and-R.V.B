# HSH Codebase Health, Cleanup & Performance Audit (AUDIT-ONLY)

**Date:** 2026-11-10. **Mode:** strictly read-only — no application source, config, dependency, translation, or test file was modified, deleted, reformatted, or committed during this mission. The only filesystem writes were: this report, fresh QA evidence under `frontend/phase3-evidence/` (prior mission), and deletion of the gitignored `frontend/.next/` build cache (required to unblock the mandated production-build check after a stale dev artifact failed type-check; documented in §11).
**Scope:** entire H.S.H application (`H.S.H-V2.0.0/frontend`, `H.S.H-V2.0.0/backend`, DB access patterns, dependencies, build system). `R.V.B-mobile/` untouched. Completed HSH localization work (uncommitted, HEAD `4a515dd`) treated as protected baseline — never flagged as unwanted code.
**Initial state (recorded before inspection):** branch `master`, HEAD `4a515dd`, 43 working-tree entries (31 modified frontend files + 12 untracked QA/report/evidence files), empty stash, no staged changes. Final state identical except this report.
**Method:** direct source reads with file:line evidence, four parallel read-only subagent sweeps (frontend dead code, backend perf/data-access, dependencies/build, quality markers — each finding independently spot-verified before inclusion), and safe existing checks: parity checker, frontend+backend `tsc --noEmit`, unit tests, full HSH (11) + RVB (4) Playwright suites, production build, scoped ESLint.

## 1. Executive Summary

The codebase is **in fair-to-good working condition with no critical defects found**, but carries **growing backend scalability debt and frontend duplication** that should be addressed before data volumes grow. The architecture is coherent (offline-first Dexie + revisioned sync, per-page i18n dictionaries, separated HSH/RVB shells); the main risks are all on the data path, not the UI.

- **Most important performance issues (all VERIFIED in source):** (a) unbounded `GET /api/sync/bootstrap` dumps ~20 collections in full (`backend/src/routes/sync.ts:98-121`) and `getBootstrapData` loads the entire `SyncChange` history (`backend/src/sync/sync-service.ts:2693`); (b) RVB request aggregation loads three full collections then paginates in JS (`rvb-request-aggregation.service.ts:227-257`); (c) every `GET /api/rvb/chats` runs the full membership sync **twice** (`chat.service.ts:943` re-invokes `listConversationsForUser` inside `getUnreadCounts`); (d) per-product N+1 read/write/read/write loops on every sale/purchase sync op (`sync-service.ts:326-338`, plus `:509-833` update/delete paths); (e) unbounded portal/account/catalog list endpoints (only 3 of ~15 list endpoints paginate).
- **Most important cleanup opportunities:** 4 dead frontend modules with zero importers (incl. a Phase-2-added `i18n-defaults.ts` nothing consumes), duplicated currency/date formatter families, service↔operation validation mirrors with message drift that already breaks legacy error matching, 2 unused production deps + 1 undeclared transitive dep, ~50 `alert()` call sites in RVB pages, and ~97 `console.*` sites (mostly intentional diagnostics).
- **No P0 security or data-integrity defect found.** Missing-index gaps and error-shape inconsistencies are P1 reliability/performance items, not active corruption.
- **Verdict on condition:** does not need substantial re-engineering; needs a focused, phased cleanup + backend pagination/indexing pass. Highest-value next mission: **Phase 1 (safe cleanup) + backend list pagination/indexing** (§12).

## 2. Project Structure

- **Frontend** (`H.S.H-V2.0.0/frontend`, Next.js 16.3.5 + React 19, App Router, 42 routes): HSH shell (`AppShell` + ClassicSidebar/FloatingNav/CompactHeader/WorkspaceTransition) vs RVB portal shell (`RvbShell` reusing the same header/nav components); Dexie offline-first store (`src/lib/database/db.ts`, versions 2–7); repository + service + operations layers; per-page `TRANSLATIONS` en/fr/ar dicts + `scripts/check-i18n-parity.ts` (60 dicts, passing); Playwright suites (`playwright.config.ts`, `playwright.i18n.config.ts`, `playwright.i18n.rvb.config.ts`, `playwright.rvb.config.ts`).
- **Backend** (`H.S.H-V2.0.0/backend`, Express 5 + Mongoose 9 + mongodb driver 7, socket.io): route groups for HSH sync/printing/invoices and ~15 RVB domains (auth, accounts, requests ×3, chats, notifications, portal, catalog, config, directory, workers/suppliers/customers); `sync-service.ts` (~2700 lines, push/pull/bootstrap engine); `chat.service.ts` (membership sync, messages, reminders); processors on 45s (reminders) and 6h (upload cleanup) intervals; QA harness (`qa-server.ts`, `rvb-qa-server.ts`) on mongodb-memory-server.
- **Database:** MongoDB via Mongoose; Dexie client-side with `syncOperations` outbox + revision cursor + `preserveSettingsNavigation`. Index coverage is good on hot paths (sync-change revision unique, conversation/message/notification/reminder/recipient indexes) with specific gaps (§4B).
- **Shared infra:** `RVB-MOBILE-CONTRACT.md` at `H.S.H-V2.0.0/` root; no shared code package between frontend/backend besides conventions.
- **Key dependencies:** frontend — next/react/dexie/lucide-react/socket.io-client, tiptap (office docs), Univer (spreadsheets, lazy), exceljs (lazy), dompurify (lazy); backend — express/mongoose/multer/socket.io/jwt/bcryptjs, pdf-to-printer + puppeteer-core (heavy, Windows printing), cloudinary (lazy). No validation framework (hand-rolled), no date lib (hand-rolled), IDs via `crypto.randomUUID` (frontend) / `uuid` (backend).

## 3. Code Cleanup Findings

**C-1 (P2, VERIFIED) — Dead modules, zero importers (whole-repo grep incl. dynamic import):**
- `src/components/notifications/NotificationBell.tsx:8` — dispatcher nobody imports (callers use `Hsh/RvbNotificationBell` directly). Safe delete candidate.
- `src/components/rvb/DirectoryPicker.tsx:70` — full component + trilingual dict, zero importers. Either wire it or delete it.
- `src/hooks/useRvbPresentationSettings.ts:9` — zero call sites.
- `src/components/common/i18n-defaults.ts` — added in Phase 2 but consumed by nothing (Loading/ErrorState/Empty/SearchField still hardcode their defaults). Either adopt it (recommended, completes Phase 2 §3 intent) or delete it.
- `src/lib/money.ts:67 formatCurrencyForLanguage`, `src/lib/i18n.ts:66 formatDateForLanguage` — definitions without callers.
- Backend `dexie` + `fake-indexeddb` in `backend/package.json` devDeps — zero references in `backend/src` (frontend-only libs, misplaced).
- `src/components/rvb/RvbRoleGuard.tsx:93-105` — two of four named guards unused; audit remaining two before deleting.

**C-2 (P2, VERIFIED) — Duplicated implementations to consolidate:**
- Date formatting: `date-format.ts` (canonical `DD/MM/YYYY`), `datetime.ts:formatDate`, `i18n:formatDateForLanguage` (dead), `dashboard-overview.ts:230`, `FormalInvoiceDocument:169`, plus ~11 local `formatDate` wrappers (`rvb/accounts|customers|workers|suppliers|page|requests|chats`, reports ×2, sales). Consolidate RVB six onto `date-format.ts`.
- Currency: `settings.formatCurrency` (exact, used by engine/charts) vs `money.formatCurrencyForLanguage` (dead) vs `compact-number.formatCompactCurrency` (summary `k/M/B`, legitimate separate purpose) vs `i18n.formatNumberForLanguage` (generic grouping). Document the exact/compact/localized boundary; delete the dead one.
- Validation mirrors: `customer/supplier/worker/product/vehicle/bank-account` service `throw`s duplicated verbatim in `services/operations/*-edit.operation.ts`, re-declared a third time as page i18n keys + `*_ERROR_MAP`s. Message drift already exists (`Registration number is required.` vs `Vehicle registration number is required.`) which breaks `matchLegacyErrorMessage` exact matching. Single-source stable codes at the service layer.
- `amount > 0` rule in 8 wordings across services/operations/pages; `i18n.ts` maps only 3.
- `NOTIF` empty/loading chrome: `BusinessOverviewChart` skeleton/error vs page-level literals — adopt-or-delete `i18n-defaults.ts` (same action as C-1).
- Shells/nav: `AppShell` vs `RvbShell` duplicate composition + cold-load comments + triplicated nav helpers (`app/page:543,553`, `AppShell:573-589`, `RvbShell:536,545`). HSH vs RVB surfaces legitimately differ — do NOT merge shells; only deduplicate the triplicated helpers into `layout/nav-helpers.ts`.
- Modals: `CancelInvoiceModal` vs `ProtectedDeleteModal` (same countdown hook, same CSS) — keep both UIs, extract shared delete-confirm core.

**C-3 (P2/P3, VERIFIED) — Noise to remove or route properly:**
- ~50 `alert()` call sites, all in RVB pages (`chats` ~15, `workers` ~13, `rvb/page` ~10, `settings/requests/suppliers/customers` rest) — replace with toasts/modals (P2 UX + reliability: `alert` blocks and is untranslated).
- ~97 `console.*`: ~25 intentional/tagged/gated (sync lifecycle, i18n dev warns, print-preview warns — keep, consider a tiny logger); the rest are bare `console.warn(err)/console.error(e)` in tasks/office/document/spreadsheet/notifications/settings/invoice catch blocks — route user-facing ones through `localizeError/resolveRvbError` + toasts, keep one-line diagnostics.
- Zero TODO/FIXME/HACK markers; no large commented-out blocks; `alert`-free HSH pages (good discipline to extend to RVB).
- `as any` density (pervasive by convention — do not purge blindly): hotspots `UniverWrapper.tsx` (~50, untyped vendor API — isolate to adapter types), `app/settings/page.tsx` (~27, Dexie/migration casts), spreadsheet `page.tsx` (~25). Riskiest writes: `office-file.service.ts:29-48,108-134` (`input/type as any` silences required-field errors), `FormalInvoiceDocument:200,306` (`(invoice as any).documentDefaultsSnapshot/paymentMethodLabel` hides schema evolution), `settings/page:2349,2365` (`save({...} as any)` bypasses `Settings` shape). 15× `as unknown as` audited — mostly DOM/event casts (low risk) except `base.repository.ts:186` (`as unknown as T`) and nav-key casts (`AppShell:84,87`, `app/page:79`) which can hide key mismatches.
- `matchLegacyErrorMessage` (20 entries, bounded today) grows by accretion; drift already observed (vehicle plate wording, `Invalid entityType ${…}` suffix, bonus/absence/salary amounts mapped only in one page). Direction: throw stable codes at source, add a parity-style test failing on new raw-English throws.

## 4. Performance Findings

**Frontend (measured where possible; no synthetic percentages invented):**
- P-F1 (P2, VERIFIED): empty `next.config.ts` — no `experimental.optimizePackageImports` for `lucide-react` (icons imported across ~30 files), no `transpilePackages`, no bundle analyzer. Build output shows a **4.4 MB chunk containing univer/tiptap/exceljs code**; route-level splitting IS correctly applied (`next/dynamic ssr:false` for `UniverWrapper`, `await import()` for exceljs/tiptap/domputs), so the weight is likely route-scoped — but without analyzer output this is UNVERIFIED at route granularity. Recommend `optimizePackageImports: ["lucide-react"]` + analyzer run.
- P-F2 (P3, VERIFIED): `tsconfig` `paths @/* → ./*` (over-broad) and `include` covering `e2e/`, root `test-*.ts`, `scripts/` — type-checks test harnesses on every build (`tsc` 12.8s in build log). Narrow `include` or split configs.
- P-F3 (P3, SOURCE-VERIFIED): largest components (`settings/page.tsx` ~2935 lines, `invoice/page.tsx` ~1874, `rvb/page.tsx` 1397, `rvb/chats/page.tsx` 1393) re-render wholesale on any settings/form state change; extract modals/drawers/i18n tables. No profiling harness exists — stated as structural opportunity, not measured bottleneck.

**Backend (all VERIFIED by direct read; severity by data-growth risk):**
- P-B1 (P0): `GET /api/sync/bootstrap` loops ~20 models with unbounded `find().lean()` + JS `_id/__v` stripping (`routes/sync.ts:102-115`); `getBootstrapData` loads entire `SyncChange` history (`sync-service.ts:2693`). Payload grows with total data + history length. → server-driven pagination/chunked snapshot + history compaction.
- P-B2 (P0): RVB request aggregation loads 3 full collections, JS-merges/sorts, then slices for pagination (`rvb-request-aggregation.service.ts:227-257`). Same anti-pattern in `report-html.service.ts:92-102` (11 parallel unbounded finds) and `ensureRecipientsForAccount` (all visible base notifications per user).
- P-B3 (P0): `GET /api/rvb/chats` runs full membership sync twice per call — `listConversationsForUser` (with nested M×E `ensureOfficialPrivate` queries, `chat.service.ts:207-283`) then `getUnreadCounts` which re-invokes it (`:943`). → compute unread from the already-fetched list; memoize membership sync per request.
- P-B4 (P1): per-product N+1 on every sale/purchase sync op — `findOne` (check) → `updateOne($inc)` → `findOne` (re-read) → `updateOne($set rev)` → `SyncChange.create` per product (`sync-service.ts:326-338`, mirrored in update/delete paths `:509-833`); `processSyncOperations` serial loop (`:2619-2627`). → single `$inc+$set` update, reuse known post-values, bulk writes where ordering allows.
- P-B5 (P1): unbounded lists — portal purchases/sales/payments/orders/events, `catalog/products`, `accounts`, `workers/suppliers/customers`, worker/supplier/customer request services. Only activities(200), messages(100), notifications(100), directory(100/30) cap. → consistent `limit/page` + total counts.
- P-B6 (P1): missing indexes on queried fields — `sale.customerId`, `purchase.supplierId`, `payment.{entityType,entityId,accountId}`, sort compounds (`submittedAt`, `createdAt`, `date`), conversation `leftAt/category/lastMessageAt` compound; `isTaskNameDuplicateUnfinished` loads ALL unfinished tasks to JS `.some()` (`sync-service.ts:59-68`) — full scan per task create/rename.
- P-B7 (P2): repeated reads — `Settings.findOne({id:"settings"})` + fallback `findOne({})` twice per invoice/request flow (`invoice.ts:407-408,674-675`; `rvb-config.ts:20-21,78-80`); per-endpoint `RvbAccount.findOne` + linked-entity re-fetch across portal routes; `getChangesAfter` fetches 500 changes then JS-filters RVB notifications.
- P-B8 (P2): inconsistent error shapes — sync push `{success,results[],message?,error?}` vs sync pull (no `success/code`) vs RVB `{success,code,message}`; raw `err.message` returned to clients (`chats.ts:75`). Bare `catch{}` in chat/socket paths (`chats.ts:235,283,…`) hides failures; reminder marks `sentAt` before notify success without retry.

**Database:** index coverage good on hot paths (sync revision unique, conversation/message/notification/reminder/recipient, customer-order idempotency); gaps listed in P-B6. No migration proposed for any finding in this report (all fixes are additive indexes, query rewrites, or pagination — each with its own rollout note in §12).

**UX:** `alert()` blocking dialogs (C-3) are the biggest smoothness win; skeleton/empty states exist but defaults are English-only in shared components (adopt `i18n-defaults.ts`); no virtualized lists yet — only needed if tables grow (POTENTIAL, not current bottleneck).

## 5. Architecture Findings

**Strengths (keep):** offline-first Dexie + revisioned sync with pending-fence + cursor discipline (verified during Phase 3); single canonical settings funnel with silent-adopt mounts and loud publish paths; per-page i18n dicts + parity gate; RVB account-preference authority cleanly separated from HSH canonical; repository/service/operations layering; deterministic notification ids.
**Simplification opportunities (P2):** (a) triplicated nav helpers → one `layout/nav-helpers.ts`; (b) RVB `formatDate(ts,lang)` ×6 + sales/wrapper variants → `date-format.ts`; (c) per-page `*_ERROR_MAP + *_FALLBACK_TEXT` (same `{en,fr,ar}+localizeError` shape across 7 pages) → one `makePageErrorMap()` factory; (d) `SETTINGS_EVENT`/`RVB_UI_PREFERENCES_EVENT` dual dispatch is intentional compat — document a removal date rather than touching now; (e) `NotificationBell` dispatcher vs direct bell imports — delete dispatcher; (f) `RvbShell`/`AppShell` duplication is surface-legitimate — do not merge.
**No circular dependencies or weak module boundaries found** beyond the noted duplications. `as unknown as` casts reviewed — no hidden systemic type unsoundness beyond listed hotspots.

## 6. Dependency Review (evidence-checked, nothing installed/changed)

- **Unused production deps (P2, VERIFIED via src+app+config+dynamic-import search):** `@floating-ui/react` (0 references), `@tiptap/extension-placeholder` (0 references; siblings used in office print-preview/doc pages). Safe removal candidates after a lockfile-regeneration test.
- **Undeclared transitive (P1):** `@univerjs/sheets-ui` dynamically imported (`UniverWrapper.tsx:457`) and patched by `postinstall` (`scripts/patch-univer.js:51`) but absent from `package.json` — a clean install without hoisted transitive can break spreadsheets at runtime. Declare it.
- **Misplaced devDeps (P3):** backend `dexie` + `fake-indexeddb` unreferenced in `backend/src` (frontend-only). Move or drop.
- **Indirect-only, keep:** `mongodb` driver (only URI strings; access via mongoose — keep only if `MongoClient/ObjectId` direct use appears), `@tiptap/pm` (type-only import, otherwise indirect).
- **Heavy but correctly lazy-loaded (no action):** `@univerjs/*`, `exceljs`, `tiptap/*` (all behind `dynamic()`/`await import()`); `puppeteer-core` + `pdf-to-printer` (Windows printing, Backend README intentional); `cloudinary` (lazy require) + `multer` (complementary).
- **No duplicates:** no date-fns/moment/dayjs/zod/yup/joi; IDs via `crypto.randomUUID` frontend (correctly avoids `uuid` dep).
- **Config gaps (P2/P3):** empty `next.config.ts` (no `optimizePackageImports`, no analyzer); `tsconfig` over-broad `paths`/`include`; `lint` bare script; missing `typecheck`/`test`/`analyze` scripts (frontend) and `lint`/`typecheck` (backend); backend tests are ad-hoc `test-*.ts` (no runner).

## 7. Security and Reliability Observations (no security code changed)

- Raw backend `err.message` reaches clients on some RVB routes (`chats.ts:75` pattern `{success:false, code, message: err?.message}`) — information-verbosity hardening opportunity (P1): return stable codes client-side, log details server-side. No auth bypass, injection, or secret mishandling found in inspected paths; secrets via env; multer bounded (26MB/1 file); no `.populate()` over-fetching (manual `$in`+`lean()` enrichment instead).
- `server.ts:196-200` admits no SIGTERM/SIGINT handlers; reminder interval not `unref`'d (cleanup processor is) — graceful-shutdown gap (P3).
- `printer.service.ts:259` `setTimeout(reject)` without `clearTimeout` on success — minor timer leak (P3).
- Sync `runAsRemote` + pending-fence + revision cursor discipline verified sound; no data-loss path found in reviewed flows.

## 8. Recommended Improvements (prioritized, no invented percentages)

**P0 — Correctness/scale walls (do first):**
1. Paginate `GET /api/sync/bootstrap` (chunked snapshot or per-entity limit+cursor) + cap/compact `getBootstrapData` SyncChange history. Impact: prevents unbounded payload/OOM as data grows. Effort: medium. Risk: medium (touch sync contract — version the endpoint, keep backward compat). Independent.
2. Push pagination into RVB request aggregation (DB-level filter/sort/limit per collection, merge only page windows) + same for `report-html` parallel finds. Impact: removes load-everything-then-slice. Effort: medium. Risk: low-medium (verify ordering parity with tests).
3. Eliminate double membership sync in `GET /chats` (compute unread from the already-fetched conversation list). Impact: ~halves queries on the hottest RVB endpoint. Effort: small. Risk: low.

**P1 — High-value perf/reliability:**
4. Merge per-product double writes (`$inc`+`$set` in one `updateOne`), drop the post-write re-read, batch where ordering allows; add `sale.customerId`, `purchase.supplierId`, `payment.{entityType,entityId}`, sort-compound, and conversation-compound indexes. Effort: medium. Risk: medium (sync engine — run full sync suites).
5. Cap all unbounded portal/catalog/account/worker lists with `limit/page` + totals.
6. Declare `@univerjs/sheets-ui`; add `typecheck`/`lint` scripts; unify error envelope (`{success,code,message}` everywhere, stop returning raw `err.message`).
7. Replace the service↔operation↔page validation triplication with stable codes thrown at source (+ parity-style test failing on new raw-English throws).

**P2 — Cleanup/modest optimization:**
8. Delete dead modules (dispatcher bell, `DirectoryPicker` or wire it, `useRvbPresentationSettings`, dead formatters, `RvbRoleGuard` unused guards); adopt-or-delete `i18n-defaults.ts`; drop the 2 unused deps.
9. Consolidate RVB `formatDate` ×6, document currency-formatter boundary, extract `makePageErrorMap()` + `isConstraintError()`, dedupe triplicated nav helpers, extract shared delete-confirm core; replace `alert()` with toasts; route bare `console.*` through logger/localizeError.
10. `next.config.ts`: `optimizePackageImports: ["lucide-react"]`; analyzer run to attribute the 4.4MB chunk per route; narrow `tsconfig` include/paths.

**P3 — Polish:** audit-dialog English chrome, dead `?? "No access"`/`confirmTitle` fallbacks (verified unreachable — remove or keep as belt-and-braces), printer timer leak, SIGTERM handlers + `unref`, `as any` hotspot typing (Univer adapter, settings migration casts), `.gitignore` `test-results/` + `playwright-report/` + evidence dirs (currently untracked noise).

## 9. Expected Benefits

Measured (not projected): build compiles + type-checks clean today; parity/test suites green — the baseline is releasable and these changes preserve that while removing scale walls. Expected (explicitly not measured): P0 items remove unbounded-memory failure modes; P-B3/P-B4 cut per-request query counts roughly in half on chats and per-product sync writes from two to one; P1 pagination converts list endpoints from O(collection) to O(page); P2 cleanup removes ~6 dead modules, 2 deps, and the validation-triplication drift class. No percentage gains are claimed without before/after profiling (none exists — recommend adding a perf harness in Phase 6).

## 10. Risks and Regression Considerations

- Sync engine (`sync-service.ts`, `apply.ts`) is the highest-risk surface: any P0/P1 change there requires the full sync + phase suites plus multi-client revision tests; keep LWW + pending-fence + cursor semantics intact.
- `RvbShell`/`AppShell` and i18n dictionaries are protected — no consolidation that alters rendered output without browser-matrix re-verification.
- Backend error-envelope unification changes client-visible shapes — coordinate with frontend `handleResponse` branches.
- Removing deps requires lockfile-regeneration + full build/test proof (especially Univer, which is postinstall-patched).
- `as any` cleanup must not weaken runtime behavior; prefer adapter types over casts at boundaries only.

## 11. Verification Results

- `git status`/HEAD/branch recorded before and after: unchanged (43 entries; HEAD `4a515dd`; empty stash; no staged changes).
- `npx tsx scripts/check-i18n-parity.ts` → pass (60/60).
- `npx tsc --noEmit` frontend → clean; backend → clean.
- Unit: `test-date-format`, `test-compact-number`, `test-notification-i18n`, `test-notification-presentation` → all pass.
- HSH Playwright (`playwright.i18n.config.ts`, fresh :5000+:3010) → 11 passed (today, current source).
- RVB Playwright (`playwright.i18n.rvb.config.ts`, fresh seeded :5001/:3001) → 4 passed (today, current source).
- `npm run build` → success (43 routes; static except 2 dynamic office routes). NOTE: first attempt failed on stale `.next/dev/types/validator.ts` (gitignored dev artifact from prior dev servers); cleared only the ignored `.next/` cache to proceed — no tracked file touched. Recommend excluding dev artifact dirs from `tsconfig.include`.
- Scoped ESLint on touched areas → only pre-existing categories (`no-explicit-any`, mount-effect sets, unused imports incl. pre-existing icons, `no-img-element`); Phase 2 additions introduce no new violations.
- Skipped/blocked: live multi-client sync load tests (no harness — scenarios marked UNRESOLVED where applicable); mobile-viewport browser matrix (no device lab — CSS-verified only); per-route bundle attribution (no analyzer configured — chunk sizes measured, route mapping UNRESOLVED).
- New files created by this mission: this report only. No source/config/dependency/test modified.

## 12. Recommended Implementation Roadmap

- **Phase 1 — Safe cleanup (low risk, independent):** delete dead modules/deps (C-1), adopt-or-delete `i18n-defaults.ts`, declare `sheets-ui`, add `typecheck`/`lint` scripts, `.gitignore` test/evidence outputs, alert→toast pass, console triage. Gate: full suites + build green.
- **Phase 2 — Redundancy elimination:** stable error codes at service sources + legacy-table shrink test, `makePageErrorMap` factory, date/currency boundary doc + RVB consolidation, nav-helper dedupe, shared delete-confirm core.
- **Phase 3 — Frontend optimization:** `optimizePackageImports`, analyzer-driven chunk attribution, split `settings`/`invoice`/`rvb`/`chats` giants (modals/drawers/dicts), narrow `tsconfig` include, Unver adapter types.
- **Phase 4 — Backend + database:** bootstrap/changes pagination + history compaction, aggregation pushdown, chats single-sync, per-product write merge, missing indexes, list pagination, error-envelope unification.
- **Phase 5 — Architectural improvements:** graceful shutdown, reminder retry semantics, notification `formatAmount` wiring (Phase 3 N-01), dual-event-channel removal date.
- **Phase 6 — Final regression + performance verification:** full suites, build, lint, fresh EN/FR/AR + RVB evidence, and a new profiling baseline before/after comparison harness.

## 13. Final Verdict

**The application is in fair-to-good condition and does not need substantial re-engineering.** The highest-value next mission is **Phase 1 (safe cleanup) combined with the P0 backend pagination/indexing items (P-B1–B3)** — small, independent, high-leverage work that removes the only scale walls found while the tree is green. After that, Phase 2 redundancy elimination (stable error codes) permanently closes the raw-English leak class that Phases 2–3 kept chasing file-by-file.
