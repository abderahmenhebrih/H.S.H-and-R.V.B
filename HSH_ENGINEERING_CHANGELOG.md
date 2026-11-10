# HSH Engineering Changelog (Master Upgrade Mission, 2026-11-10)

## Maximum Performance Mission (2026-11-10, HEAD `d821482`, uncommitted)
- Baseline: `HSH_PERFORMANCE_BASELINE.md` (production loopback TTFB/FCP/LCP, 15.17 MB bundle, index SORT→IXSCAN 5000→100 examined, aggregation ~26–42ms, heap stable). Method: memory-server synthetic data, single-run relative timings; INP/CLS/RPS/CPU/prod-plans listed as limitations.
- `app/error.tsx` + `app/global-error.tsx`: `retry` (stable v16.3.0 per installed-Next docs) primary, `reset`/reload fallback. Recovery re-fetches instead of bare re-render. 404 re-verified in production (EN).
- `UniverWrapper.tsx`: capture + dispose `onCommandExecuted` unsubscribe (listener-accumulation fix, behavior unchanged).
- `report-html.service.ts`: date predicates pushed to DB for 5 collections; equivalence harness incl. boundaries + missing dates.
- `rvb-notification.service.ts`: prefs N→1 `$in` fetch, mandatory path zero reads; opt-out/suppressed mapping harness; dead helper removed.
- `routes/sync.ts`: additive `GET /api/sync/snapshot` (keyset over unique `id`); harness: 5×100 pages union==bootstrap, repeatable, exact resume, invalid→400. Legacy `/bootstrap` untouched; no client migration shipped.
- Investigated, preserved: `id` uniques exist (no missing-index work); Cache Components rejected (cross-account staleness risk); Tiptap static is route-scoped (deferred, editor risk); chat sequential sync (race risk); Dexie fan-out (local reads, stale-data risk).
- Gates: BE/FE tsc clean, eslint clean, BE `npm test` + chat 52/52 + FE `npm test` pass, requests 23/31 (8 pre-existing env), production build green with byte-identical top chunks.

## Phase 0 — Discovery & baseline

Concise record of implemented changes. Full evidence, rationale, and deferred work: `HSH_MASTER_ENGINEERING_UPGRADE_REPORT.md`. HEAD: `d821482`. Nothing committed; R.V.B Mobile untouched.

## Phase 0 — Discovery & baseline
- Recorded clean tree at `d821482`, protected localization baseline, running services, scripts inventory.
- Baseline measurements: heaviest production chunk 4.4 MB (Univer/Tiptap/ExcelJS); HSH suite 11/11; RVB suite 4/4; backend sync integrity 34/34.

## Phase 1 — Backend hot paths + reliability fixes
- `routes/chats.ts` + `services/chat.service.ts`: `getUnreadCounts(accountId, conversations?)` reuses the already-fetched conversation list — eliminates the double membership-sync + double scan per `GET /api/rvb/chats`. Dedicated `/unread/counts` path unchanged. Verified: `test-chats-isolated` 52/52 + new `test-chat-unread-reuse` (2/2, proves identical counts with/without reuse).
- `services/printer.service.ts`: `clearTimeout` in `finally` — stale 20s timer can no longer hold the event loop after a print resolves.
- `services/rvb-chat-reminder.processor.ts`: `intervalHandle.unref()` so the 45s job never blocks shutdown (mirrors cleanup processor).
- Investigated and deliberately NOT changed: HSH settings double-fetch (id→fallback, fires once), portal per-endpoint account+entity re-reads (freshness required; caching would risk stale permissions), sync write-merge (10 high-risk sites; recipe documented for later).
- Dependencies (restored + verified Phase-1 cleanup in working tree; net manifest diff vs HEAD is nil apart from new gate scripts below): removed unused `@floating-ui/react` + `@tiptap/extension-placeholder`; declared `@univerjs/sheets-ui@^0.25.1`; removed backend dev `dexie` (kept `fake-indexeddb`, used by backend tests). Lockfiles regenerated minimally; `npm ls` clean; spreadsheet route loads with no errors.

## Phase 2 — DB indexes + bounded lists
- New `src/models/portal-list-indexes.ts` (+ `server.ts` best-effort hook): additive compound indexes `sales{customerId,date,createdAt}`, `purchases{supplierId,date,createdAt}`, `payments{entityType,entityId,date,createdAt}` — each mirrors a verified query+sort. Verified live against memory DB (indexes created, idempotent re-run).
- New `src/lib/pagination.ts` (`parsePaging`/`pagingMeta`, unit-tested) + optional `?page=&limit=` on 14 endpoints: 6 portal lists, catalog, accounts/workers/suppliers/customers lists, 3 request lists. Absent params ⇒ byte-identical legacy behavior (same query, same response shape); present params ⇒ DB-level skip/limit + `total/page/totalPages/hasMore`. Verified: tsc clean, live QA-backend checks (unlocked shape unchanged; paged returns capped rows + correct meta).
- `services/rvb-request-aggregation.service.ts`: non-search path now fetches per-source bounded windows (`page*limit` in merge order — provably complete) + server-side count aggregations for totals/KPIs; search path untouched (joined-field matching can't push down). Verified: all 14 aggregation read-tests pass; 8 failures proven pre-existing via pristine-HEAD worktree run.
- Deleted dead `getBootstrapData` (full-history SyncChange load, zero callers).

## Phase 3 — Sync bootstrap
- Design finalized, implementation deferred: versioned chunked snapshot + retention policy documented in the upgrade report. Rationale: protocol change needs multi-client verification unavailable in this mission. No sync behavior changed.

## Phase 4 — Frontend performance
- `next.config.ts`: `experimental.optimizePackageImports: ["lucide-react"]`. Build green; heavy 4.4 MB chunk unchanged (editor libs, already route-split via `next/dynamic` + `await import`). No analyzer available — per-route attribution recorded as unmeasured.
- Rendering/resources investigated (AppShell subscriptions, timers/intervals all clean up; no speculative memoization added per mission rules).

## Phase 5 — Internal quality
- No source changes (duplication found to be presentation-divergent; consolidation would change output — documented with file:line inventory for a future design pass).

## Phase 6 — Custom error experience (new, localized, design-matched)
- New: `app/not-found.tsx`, `app/error.tsx` (with `reset()` retry), `app/global-error.tsx` (self-contained `<html>/<body>`), shared `src/components/common/AppErrorPage.tsx` (uses existing `Language` type + RTL rules; `useSyncExternalStore` on `document.lang`, no new global state).
- Verified in browser: EN/FR/AR 404 + mobile 404 + error boundary render + retry re-render + console-only diagnostics (screenshots in `frontend/phase3-evidence/`).

## Phase 7 — Developer workflow
- Added `typecheck` (`tsc --noEmit`) + `test` scripts to both manifests (frontend: parity + 4 unit suites; backend: pagination unit + unread-reuse + hsh-sync integrity) — all verified passing. Backend has no ESLint config — intentionally not added (would fail on the pre-existing baseline; needs its own mission).

## Deferred (with designs/rationale in the upgrade report)
Chunked bootstrap protocol, sync write-merge recipe, Mongo sort-compound expansion, error-envelope unification, stable error codes at service sources, renderer memoization, bundle analyzer + per-route attribution, notification `formatAmount` wiring, residual English error strings.
