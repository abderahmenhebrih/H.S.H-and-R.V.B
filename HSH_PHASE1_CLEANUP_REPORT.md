# HSH Phase 1 — Safe Cleanup & Documentation Cleanup Report

**Date:** 2026-11-10. **Mode:** controlled implementation (no refactoring mission, no architecture changes, no backend logic changes).
**Baseline protected:** branch `master`, HEAD `4a515dd`; 0 staged, 0 stash entries, 31 modified + 12 untracked localization files recorded before any action; nothing reset, stashed, committed, or discarded at any point. R.V.B Mobile untouched (verified via `git status R.V.B-mobile/` — clean before and after).

## 1. Executive Summary

- **Removed genuine waste:** 4 dead frontend source files (verified zero importers repo-wide, including dynamic imports, tests, scripts, backend, and R.V.B Mobile), 2 dead exported functions (`money.ts` currency pair) + 1 dead export (`i18n.formatDateForLanguage`), 2 unused production deps + 1 misplaced backend devDep (lockfiles updated surgically: 2 insertions, 47 deletions total, no other package touched).
- **Declared 1 dependency** (`@univerjs/sheets-ui@^0.25.1`, matching the hoisted transitive copy) that was dynamically imported and postinstall-patched but missing from the manifest.
- **Preserved:** all localization behavior (full HSH 11/11 + RVB 4/4 suites pass post-cleanup), all backend behavior (sync integrity 34/34), all audit reports and evidence, all agent/contract docs, all role guards (verified used), `formatNumberForLanguage` (has a unit-test consumer), backend `fake-indexeddb` (used by ~10 backend test files — audit claim corrected).
- **Markdown:** full inventory of 23 files; **0 deleted**. Every HSH markdown file is either primary documentation, required agent/contract instruction, or the protected audit trail of the uncommitted localization baseline and the health-audit backlog that future missions depend on. Deleting any of them would violate the protection rules.
- **Alerts/logging:** inventoried (~50 `alert()`, ~97 `console.*`); **0 replaced** — no equivalent localized toast system exists in RVB, so any replacement would change UX behavior. Deferred with exact targets.
- **Overall result:** tree is smaller and more correct (dead code gone, manifest matches reality); behavior is byte-for-byte unchanged for users (verified by the full regression battery below).

## 2. Deleted Files (exact paths + reasons)

| File | Reason | Verification |
|---|---|---|
| `H.S.H-V2.0.0/frontend/src/components/notifications/NotificationBell.tsx` | Path-based dispatcher with **zero importers** (callers use `Hsh/RvbNotificationBell` directly; only self-references). Shared `NotificationBell.module.css` + both real bells kept. | Repo-wide grep (src, app, e2e, scripts, backend, R.V.B-mobile — the only mobile hits are its own unrelated component) |
| `H.S.H-V2.0.0/frontend/src/components/rvb/DirectoryPicker.tsx` | Full component + trilingual dict, **zero importers** (never wired into directory page or anywhere). | Same repo-wide grep; 0 references |
| `H.S.H-V2.0.0/frontend/src/hooks/useRvbPresentationSettings.ts` | Hook with **zero call sites** (pages manage RVB prefs locally). | Same repo-wide grep; only its own definition |
| `H.S.H-V2.0.0/frontend/src/components/common/i18n-defaults.ts` | Phase-2 addition with **zero consumers** (claimed consumers `Loading/ErrorState/Empty/SearchField` do not exist under `common/`). Adopting it now would change rendered defaults (behavior change); deleting is the smallest safe action. Re-introduction with real consumers is trivial. | Repo-wide grep; 0 references; `tsc` clean after removal |
| `formatCurrencyForLanguage` + `formatAmountForLanguage` in `src/lib/money.ts` (incl. now-unused `LangInput`/`resolveLocale`/imports) | Mutually-referencing-only pair, zero app/test callers; duplicates `settings.formatCurrency` + `i18n.formatNumberForLanguage`. File retains `roundMoney/sumMoney/computeLineTotals`. | `tsc` clean; unit tests pass |
| `formatDateForLanguage` in `src/lib/i18n.ts` | Zero references anywhere (app, tests, scripts). | `tsc` clean |

No directories, tests, evidence, images, or assets were deleted. No `git clean` used.

## 3. Retained Dead-Code Candidates (verified NOT dead)

- `RvbRoleGuard` named guards (`RvbWorkers/Suppliers/Customers/Accounts/OrdersGuard`) — **all used** (`workers:1236`, `suppliers:935`, `customers:936`, `accounts:1120`, orders guard in orders page). File untouched.
- `src/lib/i18n.ts:formatNumberForLanguage` — consumed by `test-notification-i18n.ts`; a used shared helper is not waste. Retained.
- Backend `fake-indexeddb` — imported by ~10 backend `test-*.ts` files. **Retains; corrects the health-audit claim** (which only searched `src/`).
- `mongodb` driver (backend) — indirect-only (URI strings; access via mongoose). No direct `MongoClient` use found; retained without action (harmless, no removal benefit proven).
- `NotificationBell.module.css`, RVB `DirectoryPicker` styles (none — styles live in page modules; nothing orphaned).

## 4. Dependency Changes

**Frontend `package.json`:** removed `@floating-ui/react@^0.27.20` (0 references repo-wide), removed `@tiptap/extension-placeholder@^3.31.3` (0 references; siblings verified in use), added `@univerjs/sheets-ui@^0.25.1` (dynamically imported `UniverWrapper.tsx:457` + patched by `scripts/patch-univer.js:51`; version pinned to the hoisted transitive copy, matching `preset-sheets-core@^0.25.1`). **Lock diff: +1/−36 lines** (two package entries + orphaned `tabbable` removed; sheets-ui entry already present transitively, now direct). No other package touched.
**Backend `package.json`:** removed dev-only `dexie@^4.4.6` (zero references in `src/`, tests, and scripts). Kept `fake-indexeddb` (test dependency in active use). **Lock diff: −9 lines, dexie entry only.**
**Resolution verified:** `npm ls @floating-ui/react @tiptap/extension-placeholder` → extraneous (lock no longer requires them); `npm ls @univerjs/sheets-ui` → `0.25.1 deduped` under presets chain; backend `npm ls dexie fake-indexeddb` → dexie extraneous, fake-indexeddb kept. `node_modules` left as-is (untracked, environment-specific; no `npm prune` run).
**Did not touch:** `mongodb`, `mongoose`, `cloudinary`, `puppeteer-core`, `exceljs`, `univer/*` versions, React/Next, or any transitive pin.

## 5. Documentation Cleanup

**Inventory (23 files):**
- HSH primary/required (RETAINED, 5): `frontend/README.md` (install/env/scripts/features — verified accurate §8), `backend/README.md` (accurate, incl. printing note), `frontend/AGENTS.md` (required next-dev tool instructions), `frontend/CLAUDE.md` (12-byte `@AGENTS.md` pointer — required agent config), `H.S.H-V2.0.0/RVB-MOBILE-CONTRACT.md` (active cross-project contract, explicitly protected).
- Audit trail (RETAINED, 6): `I18N_AUDIT_REPORT.md`, `HSH_I18N_REPAIR_REPORT.md`, `HSH_FINAL_I18N_REAUDIT_REPORT.md`, `HSH_I18N_PHASE2_IMPLEMENTATION_REPORT.md`, `HSH_PHASE3_FINAL_RELEASE_AUDIT.md`, `HSH_CODEBASE_HEALTH_AUDIT.md` — the sole documentation of the protected uncommitted baseline and of the P0–P3 backlog that subsequent missions are defined against. Deleting them would destroy traceability the protection rules require.
- R.V.B Mobile (10 + generated `.expo/README.md`): out of scope, untouched by design.
- Generated (1): `frontend/playwright-report/data/*.md` — gitignored regenerable runner artifact; left in place (deleting single files from an ignored cache achieves nothing).
- This report (`HSH_PHASE1_CLEANUP_REPORT.md`): new mission record.

**Retained: 22 + this report. Deleted: 0.** No root `README.md` exists in the repo (nothing to preserve there; both project READMEs are accurate and were left byte-identical). No consolidation performed: the reports are non-duplicative phase records, and the mission forbids turning the README into a dump. No Markdown file outside HSH was touched.

## 6. Gitignore Changes

**None — verified already covered.** `frontend/.gitignore` ignores `test-results/`, `playwright-report/`, `qa-results/`, `playwright/.cache/`, `.next/`, `coverage`. Evidence dirs (`phase2-evidence/`, `phase3-evidence/`, `re-audit-evidence/`) intentionally remain visible (protected audit evidence, not noise). Backend `.gitignore` exists; no generated-output rules missing for its layout.

## 7. Alert and Logging Cleanup

**Inventory:** ~50 `alert()` calls, all in RVB pages (`chats` ~13, `workers` ~10, `rvb/page` ~10, settings/requests/suppliers/customers rest). **All use translated strings** (`t.*`) — no localization defect; the issue is UX pattern (blocking dialogs), including validation guards, send/leave/pin/audit failure paths, and group-name prompts.
**Decision: 0 replaced, all deferred.** No toast/modal system exists in RVB (verified: only desktop OS toasts for important notifications) — any replacement would change user-visible behavior (blocking→inline, confirmation flows), violating the final principle. Destructive-action confirmations must keep blocking semantics; validation alerts need a designed inline-error pass per page.
**Console (~97 sites):** intentional sync lifecycle/i18n/print diagnostics kept; bare `console.error/warn` in office/document/spreadsheet/notifications/settings/invoice catch blocks deferred (each routes through UI state already; rewiring risks behavior change).
**Provided for the follow-up mission:** exact file:line inventory above + Phase 3 N-02 list (`resolveRvbError`/`localizeError` targets).

## 8. Verification Results

| Check | Command | Result |
|---|---|---|
| Parity | `npx tsx scripts/check-i18n-parity.ts` | pass (60/60) |
| Frontend tsc | `npx tsc --noEmit` | clean |
| Backend tsc | `npx tsc --noEmit` | clean |
| Notification i18n unit | `npx tsx test-notification-i18n.ts` | pass (also proves retained `formatNumberForLanguage` still works) |
| Notification presentation unit | `npx tsx test-notification-presentation.ts` | pass |
| Date/compact units | `npx tsx test-date-format.ts`, `test-compact-number.ts` | pass |
| HSH browser suite | `playwright test --config=playwright.i18n.config.ts` (fresh :5000+:3010) | **11 passed** |
| RVB portal suite | `playwright test --config=playwright.i18n.rvb.config.ts` (fresh seeded :5001/:3001) | **4 passed** |
| Backend sync integrity | `npm run test:hsh-sync` | **34 passed, 0 failed** |
| Production build | `npm run build` | success (43 routes; first attempt blocked by stale gitignored `.next/dev` types — cache cleared, documented, rebuilt clean) |
| Scoped ESLint (edited files) | `npx eslint src/lib/money.ts src/lib/i18n.ts ...` | no new issues (remaining hits pre-exist in untouched files) |
| Dep resolution | `npm ls` (both projects) | correct (removed=extraneous, added=resolves, kept=intact) |
| Spreadsheet load | dev server + Playwright load of `/office/spreadsheet/<invalid-id>` + `/office` | 200s, zero pageerrors, office home renders (Univer dynamic imports + postinstall patch intact) |
| README accuracy | read both READMEs vs `package.json` scripts/layout | accurate, unchanged |

## 9. Remaining Work (explicitly deferred per mission scope)

Backend pagination/indexes, sync write-merge, aggregation pushdown, chats double-sync, error-envelope unification, stable validation codes, date/currency consolidation, nav-helper dedup, component splitting, bundle optimization (`optimizePackageImports`, analyzer), graceful shutdown, alert/toast migration, console triage, notification `formatAmount` wiring (Phase 3 N-01), residual English error surfaces (Phase 3 N-02). The health-audit report remains the authoritative backlog; nothing in it was invalidated.

## 10. Final Git State

- Original: HEAD `4a515dd`, 0 staged, 31 modified, 12 untracked, 0 stash. Final: same HEAD, 0 staged, 0 stash; **37 modified** (+`money.ts`, `i18n.ts`, 2 manifests, 2 lockfiles), **3 tracked deletions** (dead modules), untracked minus deleted `i18n-defaults.ts` plus this report.
- Exact new modifications: 4 file deletions, 2 function deletions (`money.ts` pair), 1 function deletion (`i18n.formatDateForLanguage`), frontend manifest −2/+1 deps, backend manifest −1 devDep, 2 lockfile updates (2 insertions, 47 deletions total, no unrelated package touched).
- **Confirmation: no pre-existing user changes were discarded, reset, stashed, or overwritten** (diff of the original 31 files untouched by this mission — verified identical hunks; localization behavior intact per the passing 11/11 + 4/4 suites). No commits made. R.V.B Mobile untouched.
