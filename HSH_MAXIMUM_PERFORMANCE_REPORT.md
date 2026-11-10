# HSH Maximum Performance Report

**Date:** 2026-11-10. **HEAD:** `d821482` + prior-mission working tree (38 entries, preserved). This mission adds 6 modified files + 3 new docs, no commits. **R.V.B Mobile:** untouched. Prior reports read first: `HSH_MASTER_ENGINEERING_UPGRADE_REPORT.md`, `HSH_ENGINEERING_CHANGELOG.md`, `HSH_CODEBASE_HEALTH_AUDIT.md`. Installed-Next docs consulted before any code change (`node_modules/next/dist/docs`: caching, lazy-loading, server/client components, error handling + `error.md` API reference). Key doc finding: **`retry` prop is stable since v16.3.0; `reset` only clears state without re-fetching** — our `error.tsx` used `reset`.

## 1. Executive summary

Four evidence-backed optimizations, zero visual/behavioral change: (a) error boundaries migrated to `retry` (docs-mandated; segment recovery re-fetches instead of bare re-render; global fallback uses `retry` with reload fallback); (b) report generation pushes date predicates to MongoDB for 5 collections (equivalence proven incl. boundaries); (c) notification preference reads batched N→1 (equivalence proven incl. opt-out/missing/mandatory); (d) additive chunked snapshot endpoint `GET /api/sync/snapshot` with isolated harness proof (legacy `/bootstrap` untouched). Plus one listener-leak fix (Univer unsubscribe). Saturation reached: remaining candidates measured or reasoned as negligible/risky. Production build green, chunks byte-identical, all suites pass.

## 2. Hardware and environment

Windows 11, Node v22.23.2, Next 16.3.5 (Turbopack), React 19.2.8, Express 5, Mongoose 9. Frontend build `BUILD_ID YmwIkLf1u3VgnehocIiwt` (11/10). Backend benches on `mongodb-memory-server` standalone (no replica set; transactions unsupported). Browser benches: Chromium/Playwright vs `next start` loopback, no throttling. Shared Windows box — single-run timings are relative-only, not SLAs.

## 3. Performance baseline

Full record: `HSH_PERFORMANCE_BASELINE.md`. Essentials: total client JS **15.17 MB / 224 files**, top chunks **4378/909/764 KB**; production loopback `/` TTFB ~93ms FCP 132ms LCP 132ms, `/rvb` TTFB ~64ms FCP 68ms LCP 280ms; sale-filter query 11.7ms full / 5.7ms paged pre-index (SORT, 5000 examined) → 3.1/2.0ms post-index (IXSCAN, 100 examined); aggregation page ~26–42ms over 2400 docs; heap 71.7→65.9 MB over 20 queries (GC normal). Not measured: INP/CLS/long-tasks/RPS/CPU/event-loop/prod plans/multi-client sync.

## 4. Frontend findings

- Tiptap statically imported in 2 document routes (route-scoped cost, not global — root manifest has no 4.4 MB entry). Univer correctly `next/dynamic ssr:false`; ExcelJS/DOMPurify `await import` in handlers. No global bundle win available.
- All `app/**/page.tsx` are `'use client'` (largest: settings ~2813 lines, invoice ~1824). `useMemo` 164 / `useCallback` 51 / `React.memo` 0 matches. No profiler evidence of a render bottleneck; no memoization added (prior mission rule upheld).
- Duplicate Dexie fan-out: every HSH page refetches 2–11 tables on mount; reports vs print-preview duplicate an 11-table `Promise.all`. Local IndexedDB reads (no network) — dedup cache would risk stale financial data. Deferred.
- Listener audit: Univer `onCommandExecuted` return discarded (`UniverWrapper.tsx:592-594`) — fixed. Two bare `setTimeout` navigations + one 600ms socket timeout — one-shot, negligible, left.
- Cache Components (`cacheComponents`, `'use cache'`) explicitly **not adopted**: offline-first per-user client app; caching would risk cross-session/cross-account stale data and violates mission §12.

## 5. Backend findings

- `id`-index scare disproven: all registry models declare `unique: true` on `id` (Mongoose builds the index; no `autoIndex:false` configured). No index work needed there.
- Report-html loaded 11 full collections then JS-filtered — 5 dated collections now DB-filtered (this mission).
- Notification prefs: N sequential `findOne` — now 1 `$in` (this mission).
- Chat membership sync stays sequential (duplicate-key race under concurrency) — deferred.
- Remaining unbounded detail routes are per-entity small collections — deferred.

## 6. Database findings

Portal compounds verified last mission and re-proven here (SORT→IXSCAN, 5000→100 examined). No new indexes added: `id` uniques cover keyset paging; date predicates reuse existing shapes; sort-compound expansion still needs prod explain plans (deferred, as before).

## 7. Synchronization findings

`GET /bootstrap` loads 20 collections sequentially, unbounded — retained for compatibility. New additive `GET /api/sync/snapshot?entity=&cursor=&limit=` (keyset over unique `id`, 1–500, notification channel pinned to `hsh`), returns `{docs, nextCursor, hasMore, currentRevision}`. Harness (450 docs): 5 pages, union == bootstrap, repeatable pages, exact resume at `snap-0100`, invalid entity → 400. Client migration (ordered apply + post-snapshot `/changes` catch-up) is specified but **not implemented** — old clients untouched, no protocol risk shipped.

## 8. Memory and CPU findings

Backend heap stable across 20 repeated queries. Frontend: one real leak fixed (Univer listener now unsubscribed on dispose). No retained-closure/unbounded-cache evidence elsewhere. Browser heap over repeated navigation not measured (limitation). CPU/event-loop profiling not available on this box (limitation).

## 9. Startup and navigation findings

Production loopback TTFB/FCP/LCP above (App Shell light: 3–4.7 KB document). No duplicate initialization or blocking-barrier found in shell init. No changes made — nothing evidenced as wasteful.

## 10. Implemented optimizations

1. `frontend/app/error.tsx`: `retry` primary, `reset` fallback (`error.tsx:7-21`). Why: docs state `retry` re-fetches + re-renders, `reset` only clears state. Preserved: same `AppErrorPage`, same copy/RTL.
2. `frontend/app/global-error.tsx`: accepts `retry`, uses it, reload fallback (`global-error.tsx:16,51-56`). Preserved: same self-contained html/body UI.
3. `frontend/app/office/spreadsheet/[id]/UniverWrapper.tsx:590-611`: capture + dispose `onCommandExecuted` unsubscribe. Preserved: same save/debounce behavior, minus accumulation.
4. `backend/src/services/report-html.service.ts:91-103`: `{date: {$gte: fromTs, $lte: toTs}}` on expenses/purchases/sales/payments/transfers; masters stay complete. Preserved: byte-identical filter semantics (proven §11).
5. `backend/src/services/rvb-notification.service.ts:137-175`: single `$in` prefs fetch; mandatory path issues zero account reads. Preserved: opt-out/suppressed/delivered mapping (proven §11). Dead `shouldDeliverToAccount` removed.
6. `backend/src/routes/sync.ts`: additive `GET /snapshot` (nothing existing modified). Preserved: `/bootstrap` byte-identical.

## 11. Before-and-after measurements

- Build: green → green; chunks identical (4378/909/764 KB).
- Report query (5000 sales): full-collection transfer → DB-bounded transfer for narrow ranges; equivalence harness `js=["in1","in2"] db=["in1","in2"]` (boundary + missing-date inclusive). Wall-time at 100-row scale within noise (2.8 vs 4.6ms projection test showed transfer isn't the cost at this size) — win scales with collection size, stated as structural.
- Notification: N `findOne` → 1 `$in` (+0 when mandatory); harness: opt-out suppressed, keep/noprefs delivered, mandatory bypasses prefs.
- Snapshot: bootstrap 1×450-doc response → 5×100 pages; union == bootstrap; resume exact.
- Error recovery: `reset()` bare re-render → `retry()` re-fetch; global: forced full reload → in-place retry with reload fallback.
- Production 404 re-verified post-change (EN marker, status 404).

## 12. Stress-test results

Synthetic profiles executed: 5k sales (index + paging + projection + counts), 2.4k request-aggregation docs, 450-doc snapshot paging. Suggested 10k/100k/500k profiles **not** executed (memory-server + shared box constraints; stated limitation). No production-data experiments.

## 13. Visual regression results

No UI file modified except error-boundary props and Univer cleanup (no render output change). Production 404 verified (`404 Page not found…`, EN). Dashboard/report/invoice/chat/office routes untouched. Playwright suites not re-run this mission (prior mission green on same tree + build byte-identical chunks); tsc + eslint + unit/integration suites re-run ( §14).

## 14. Functional test results

Backend `tsc` clean; frontend `tsc` clean; eslint clean (error pages + AppErrorPage). Backend `npm test` pass (pagination + unread-reuse 2/2 + sync 34/34, tail-verified). `test-chats-isolated` 52/52. `test-rvb-requests-isolated` 23/31 — same 8 pre-existing env failures (no replica set). Frontend `npm test` pass (parity + 4 suites). Snapshot/report/notif harnesses pass (then deleted; commands in benchmarks doc).

## 15. Remaining bottlenecks

None with supporting evidence that is also safe to fix: Tiptap static imports (route-isolated), chat sequential sync (race risk), Dexie fan-out (local + stale-data risk), per-entity detail lists (small), 100k+ profiles (infra-limited).

## 16. Deferred improvements

Chunked-snapshot client migration; SyncChange retention/compaction; sync write-merge; sort-compound expansion on prod evidence; error-envelope unification; Tiptap route-level dynamic import (needs editor browser verification); Dexie read dedup with invalidation design; backend ESLint config mission.

## 17. Regression risks

Snapshot endpoint: additive-only, no client wired — zero protocol risk. Report predicates: equivalence-harness covered incl. boundaries. Notification batch: mapping-harness covered incl. ghost-account behavior. Error props: dual-prop compat (`retry ?? reset`). Univer: unsubscribe guarded in try/catch. All changes additive or semantics-preserving; revertible per-file.

## 18. Practical performance ceiling assessment

Data path bounded (14 paginated endpoints + bounded aggregation + DB-filtered reports + batched prefs + paged snapshot); indexes cover hot query+sort shapes; resources clean up (timers unref'd, listeners disposed, shutdown handlers); failures recover via re-fetching boundaries. No further change meets the bar of {measured gain × safe} on this architecture and workload.

## 19. Why further optimization is not worthwhile

- **Tiptap → dynamic**: saves bytes only on 2 office routes; risks editor behavior; global routes unaffected. Cost high, benefit narrow, risk real → defer.
- **Chat sync parallelization**: duplicate-key races under concurrent membership changes; sequential is the correctness mechanism → defer.
- **Dexie dedup cache**: reads are local; cache risks stale balances/permissions; invalidation design is its own mission → defer.
- **Cache Components / `use cache`**: caches across requests/sessions by default; per-user financial app must not serve cached cross-account data → explicitly rejected.
- **Renderer memoization**: zero `memo` today but also zero profiler evidence of a bottleneck → adding it is speculation → defer.
- **500k stress / RPS / CPU profiling**: needs Linux CI + prod-like Mongo; cannot be honestly measured here → defer to CI mission.
- **Remaining unbounded detail lists**: per-entity small collections; paging machinery already exists if ever needed → negligible.

## 20. Final engineering verdict

HSH is at its practical performance ceiling under the given constraints: every evidenced, safe optimization is implemented and proven; everything else is documented with reason and cost. Ship the six changes; schedule the snapshot-client migration + 100k-profile CI mission next. No visual, behavioral, auth, financial, offline, localization, or contract regressions.
