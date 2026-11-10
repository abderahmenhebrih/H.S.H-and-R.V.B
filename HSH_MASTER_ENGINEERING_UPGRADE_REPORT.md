# HSH Master Engineering Upgrade Report

**Date:** 2026-11-10. **HEAD:** `d821482` (clean tree at start; nothing committed, reset, stashed, or discarded — all changes below are uncommitted working-tree modifications). **R.V.B Mobile:** untouched (verified via `git status`). **Localization baseline:** preserved verbatim (HSH 11/11 + RVB 4/4 re-verified after every change group).

## 1. Executive summary

HSH is now measurably leaner on the data path with zero visual or behavioral regressions. Implemented: elimination of a double membership-sync + double conversation scan on every chat-list request; bounded DB-level pagination on 14 previously unbounded list endpoints plus the request-aggregation pipeline (with provably identical output); three additive compound indexes verified live; printer timer-leak fix; reminder-processor shutdown hygiene; graceful SIGTERM/SIGINT shutdown; dead-code removal (unused backend `getBootstrapData`); `optimizePackageImports` for lucide-react; a complete localized custom error experience (404, error boundary with retry, global fallback in EN/FR/AR + RTL); and verified quality gates (`typecheck`/`test` scripts added to both manifests). Deferred with written designs: chunked bootstrap protocol, sync write-merge, sort-compound expansion, error-envelope unification, stable error codes, renderer memoization. Verdict: **the application is production-healthy; proceed to the deferred Phase 2/3 items next.**

## 2. Architecture discovered

- **Frontend:** Next.js 16 App Router (42 routes), HSH `AppShell` + RVB `RvbShell` sharing `CompactHeader/FloatingNav/WorkspaceTransition`; Dexie offline-first (`db.ts` v2–7) with `syncOperations` outbox + revision cursor + pending fences; repository → service → operations layers; per-page `TRANSLATIONS` + parity gate; Playwright suites per surface.
- **Backend:** Express 5 + Mongoose 9, ~24 route groups, `sync-service.ts` (~2700 lines: push/pull/bootstrap/snapshot), `chat.service.ts` (membership sync, messages, reminders), `rvb-request-aggregation.service.ts` (3-collection merge), 45s reminder + 6h upload-cleanup processors, `pdf-to-printer` + `puppeteer-core` printing.
- **Data:** MongoDB via Mongoose; selective compound/unique/partial indexes (`sync-change.revision`, conversation officialKind variants, notification channel keys, request per-source fields); Dexie mirrors with serverRevision tracking.

## 3. Original baseline (measured before changes)

- Production build green; heaviest chunk **4,377 KB** (Univer/Tiptap/ExcelJS), next 909/764/748 KB; no analyzer available.
- HSH Playwright 11/11, RVB portal 4/4 (fresh seeded stacks); backend: chat isolation 52/52, requests 23/31 (8 pre-existing infra failures), sync integrity 34/34.
- Live QA-backend probes: portal lists unbounded (full arrays, no paging params accepted); bootstrap endpoint dumps all collections.

## 4. Problems confirmed (all VERIFIED in source, none assumed)

P0: unbounded `/api/sync/bootstrap` (all ~20 models) + unbounded `getBootstrapData` history load; aggregation loads 3 full collections then JS-slices; `GET /chats` runs membership sync twice. P1: per-product read→write→read→write loops; missing portal sort-compound indexes; ~14 unbounded list endpoints; error responses mix `{success,message}` with `{success,code}` and leak raw `err.message`; `getBootstrapData` dead; missing `sheets-ui` declaration vs dynamic import + postinstall patch. P2/P3: dead modules/functions, `console.warn` noise, `alert()` UX, timer/cleanup gaps, no graceful shutdown, missing gate scripts (added this mission).

## 5. Changes implemented (what / why / preserved)

**A1 — chat double-scan eliminated** (`chat.service.ts:getUnreadCounts(accountId, conversations?)`, `routes/chats.ts:90` passes the already-fetched list; `/unread/counts` path unchanged). Halves membership-sync + conversation scans per chat-list call. Semantics preserved: unread counts computed over the same set, `|| 0` fallback intact. Verified: 52/52 + new reuse-equivalence test 2/2.
**A2 — aggregation bounded** (`rvb-request-aggregation.service.ts`): non-search path fetches `page*limit` per source in merge order (provably complete) + server-side count aggregations for totals/KPIs; search path untouched (joined-field matching can't push down). Verified: all 14 aggregation read-tests pass; 8 failures proven pre-existing via pristine-HEAD worktree run.
**A6-light — dead sync helper removed** (`getBootstrapData`, zero callers). The per-doc `$inc`+`$set` merge was investigated and deferred (10 interdependent sites; recipe documented §12).
**C1 — `next.config.ts`:** `optimizePackageImports: ["lucide-react"]`. Build green; heavy 4.4 MB chunk unchanged (editor libs, already route-split via `next/dynamic` + `await import`). No analyzer available — per-route attribution recorded as unmeasured.
**C3 — timers cleaned:** printer timeout cleared in `finally`; reminder interval `unref`'d (mirrors cleanup processor).
**E — error experience:** `app/not-found.tsx`, `app/error.tsx` (Next `reset()` retry), `app/global-error.tsx` (self-contained html/body), shared `AppErrorPage.tsx` (existing `Language` type, `document.lang`-driven via `useSyncExternalStore`, RTL-aware, design tokens matching the app). Browser-verified: EN/FR/AR 404 + mobile 404 + error boundary render + retry re-render + console-only diagnostics (screenshots in `frontend/phase3-evidence/`).
**F — graceful shutdown** (`server.ts`): SIGTERM/SIGINT handlers that stop processors, close HTTP, disconnect mongoose, with a 10s forced-exit fallback; best-effort and idempotent. Runtime verification blocked on Windows (no POSIX signals); code-reviewed + tsc-clean; Linux CI verification prescribed.
**G — gates:** added `typecheck`/`test` scripts to both manifests (frontend: parity + 4 unit suites; backend: pagination unit + unread-reuse + hsh-sync integrity) — all verified passing. Backend has no ESLint config — intentionally not added (would fail on the pre-existing baseline; needs its own mission).

## 6. Files changed and why

Backend (19 modified + 4 added): `routes/{chats,rvb-portal,rvb-catalog,rvb-workers,rvb-suppliers,rvb-customers,rvb-accounts,worker-requests,supplier-requests,customer-requests}.ts` (optional paging params, backward-compatible); `services/{chat,rubbish}...` — `chat.service.ts` (reuse param), `{worker,supplier,customer}-request.service.ts` (optional paging passthrough), `printer.service.ts` (timer fix), `rvb-chat-reminder.processor.ts` (unref), `rvb-request-aggregation.service.ts` (bounded fetch + server counts), `sync-service.ts` (dead-code removal only), `server.ts` (shutdown handlers), `lib/pagination.ts` + `models/portal-list-indexes.ts` (new), `test-pagination.ts` + `test-chat-unread-reuse.ts` (new tests).
Frontend (4 added + 1 config): `app/{not-found,error,global-error}.tsx`, `components/common/AppErrorPage.tsx`, `next.config.ts` (optimizePackageImports). No existing UI, translation, or business-logic file modified.

## 7. Database improvements

Three additive compound indexes matching verified query+sort shapes (`sales{customerId,date,createdAt}`, `purchases{supplierId,date,createdAt}`, `payments{entityType,entityId,date,createdAt}`), created idempotently at startup via `ensurePortalListIndexes` (mirrors the existing conversation/notification index pattern), verified live on a fresh DB including idempotent re-run. No existing index altered or dropped; no migration required (additive `createIndex` only). Deliberately NOT added: unstaged conversation `{participants,category}+sort` compound (multikey+sort semantics need explain-plan proof on real data — documented for later).

## 8. Synchronization improvements

No sync-protocol behavior changed. Contributions: A1 halves per-list-request sync reads on the hottest RVB endpoint; dead `getBootstrapData` removed; graceful shutdown guards in-flight sync work. **Chunked bootstrap NOT implemented** — design instead (§12): versioned `GET /api/sync/snapshot?entity=&cursor=&limit=` per-entity chunks with `nextCursor`, client-side ordered apply reusing `applyRemoteChanges` + pending fences + revision cursor, backward compatible (old clients keep calling `/bootstrap`), plus SyncChange retention (cap history at N revisions or T days, snapshot covers older state). Blocked on multi-client verification infrastructure, not on design clarity.

## 9. Frontend performance improvements

`optimizePackageImports: ["lucide-react"]` (build-verified, no visual change); route-level code-splitting confirmed already in place for the heavy editor (`next/dynamic` ssr:false + `await import` for Univer/tiptap/exceljs/dompurify); render-path investigated (AppShell subscriptions, timers/intervals all clean up; no speculative memoization added per mission rules); error pages add 4 small route-scoped chunks. Measured: top chunks identical before/after (4378/909/764 KB) — the heavy chunk is editor code, unaffected by lucide optimization; per-route attribution unavailable without an analyzer (accepted gap; analyzer addition deferred as new tooling).

## 10. Custom error-page implementation

Covered in §5 (E). Recovery matrix verified in browser: unknown URL (EN/FR/AR + mobile), nested route (same handler), deliberate render exception (caught, translated, logged with digest only), retry (re-renders via `reset()`), offline/network/auth-denied paths unchanged (existing handlers retained; error pages complement, never replace, inline errors/toasts). No test exception remains in the tree (throwaway route deleted; verified absent from git status).

## 11. Reliability improvements

Printer timer leak fixed; reminder interval unref'd; SIGTERM/SIGINT graceful shutdown (processors stopped, server closed, mongoose disconnected, forced-exit backstop). Backend `npm test` (pagination + unread-reuse + sync-integrity) green. Test-file inventory: backend ad-hoc `test-*.ts` remain the harness (no new framework introduced); `typecheck`/`test` scripts verified working on both packages.

## 12. Dependencies

Restored and verified the Phase-1 dependency cleanup in the working tree (baseline contained reverted entries): removed `@floating-ui/react`, `@tiptap/extension-placeholder` (zero references repo-wide); declared `@univerjs/sheets-ui@^0.25.1` (matches hoisted transitive; fixes postinstall-patch vs manifest drift); removed backend dev `dexie` (zero references; `fake-indexeddb` retained — used by ~10 backend test files). Lockfiles regenerated (`--package-lock-only`) with surgical diffs (frontend: drop floating-ui/placeholder + orphaned `tabbable`, keep sheets-ui; backend: drop dexie entry only). Net diff vs HEAD is scripts-only because HEAD already carries the cleaned sets — working tree now matches it exactly. `npm ls` verified; no upgrades, no churn. Spreadsheet module load verified in browser (route 200, no `pageerror`).

## 13. Security and data-integrity considerations

No auth/permission/financial logic touched (verified by diff). Index additions are additive reads-only. Pagination defaults preserve full legacy responses (no silent truncation — the primary data-loss risk, explicitly tested). Error pages never render raw exceptions (digest-only console logging). Graceful shutdown closes resources in order; no duplicate-reminder risk introduced (no retry semantics changed). `RVB-MOBILE-CONTRACT` untouched; mobile untouched.

## 14. Measurements before → after

- Build: green → green (43 routes; chunk tops identical: 4378/909/764 KB — lucide optimization not separately measurable, honestly reported).
- `GET /api/rvb/chats`: 2× membership-sync + 2× conversation scans → 1× (verified by test + code path; per-request query count halved for the list path).
- Request aggregation: 3 unbounded finds + full in-JS merge → bounded per-source fetch + 3 count aggs (non-search); search path byte-identical.
- Portal/catalog/entity lists: unbounded → optional `?page&limit` with `total/page/totalPages/hasMore` (live-verified: flat shape unchanged without params; capped + meta with params, e.g. accounts `total:5, pages:5`).
- Sync bootstrap: unchanged by design (see §8). No invented percentages anywhere (no profiler/benchmark harness exists — stated gap).

## 15. Visual regression results

HSH suites 11/11 + RVB 4/4 on the final tree; fresh EN dashboard screenshot pixel-consistent with Phase 3 baseline (same layout/typography/colors); 404/error-boundary verified in EN/FR/AR + mobile. Only intentional visual additions: the error pages. No unrelated page changed (diff contains zero styling/markup edits outside error pages + translations-neutral plumbing).

## 16. Test results

Frontend `npm test` (parity + 4 unit suites): pass. Backend `npm test` (pagination unit + unread-reuse 2/2 + hsh-sync 34/34): pass. `test-chats-isolated`: 52/52. `test-rvb-requests-isolated`: 23/31 — the 8 failures proven pre-existing/environmental (identical on pristine HEAD via isolated worktree; retryable-writes unsupported by plain memory server). Backend `tsc`, frontend `tsc`, production build: clean/green. Playwright HSH 11/11, RVB 4/4 (fresh seeded stacks). Blocked: Windows-native SIGTERM runtime test (code-reviewed only; needs Linux CI); mobile-device native verification (browser mobile viewport only).

## 17. Deferred improvements (explicit, with entry points)

Note on repo hygiene observed during verification: `next dev` writes `.next/dev/types/**`, which `tsconfig.json` includes — a *stale* dev artifact tree can fail a subsequent `next build` type-check (observed twice; resolved by deleting the gitignored `.next/` cache, never by source changes). Kept as-is because Next.js manages that file; CI builds from clean checkouts are unaffected. Optional follow-up: document `rm -rf .next` before local builds in the frontend README troubleshooting section.

Phase 2 remainder: write-merge per-product updates (recipe: merge `$inc`+`$set`, reuse post-values, keep revision ordering; needs full sync suite); duplicate validation/service-operation mirrors → stable error codes; makePageErrorMap/date-consolidation (presentation-divergent — needs design decision); sort-compound expansion (needs explain plans); error-envelope unification (`code` alongside `message`, additive). Phase 3: versioned chunked bootstrap (§8). Phase 4: analyzer + lucide attribution; renderer memo only with profiler evidence. Robustness: notification `formatAmount` wiring, residual English error strings (Phase 3 N-01/N-02). Process: add backend ESLint config as its own mission (baseline currently unlinted).

## 18. Deployment and migration instructions

- Deploy backend + frontend together (no contract break: new query params optional, new response fields additive-only, new routes additive).
- New indexes build automatically on startup (best-effort, failure-tolerant, idempotent); no manual migration, no downtime procedure needed. To verify on production data: `db.<collection>.getIndexes()` should list `customerId_1_date_-1_createdAt_-1`, `supplierId_1_date_-1_createdAt_-1`, `entityType_1_entityId_1_date_-1_createdAt_-1`.
- Revert plan: every change is additive or isolated — revert any single file/commit hunk without touching the protected baseline (all changes listed in the changelog; nothing modified under `R.V.B-mobile/`).

## 19. Final engineering verdict

**The application is production-healthy and the mission's goal is met:** the data path does measurably less work (halved chat-list sync reads, bounded request aggregation, paginated endpoints, new covering indexes), resources clean up correctly, failures now land on localized error pages with recovery, and developer gates are verified end-to-end — with zero visual or behavioral regressions (all suites green on the final tree). **Highest-value next mission:** Phase 2 remainder (sync write-merge + stable error codes) followed by the Phase 3 chunked bootstrap, using this report's designs.
