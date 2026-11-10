# HSH Performance Baseline

**Date:** 2026-11-10. **HEAD:** `d821482` + 38 uncommitted entries from the prior engineering mission (preserved, not modified by this mission unless stated). **R.V.B Mobile:** untouched.

## Environment
- OS: Windows 11, Node v22.23.2, Next 16.3.5 (Turbopack), React 19.2.8, Express 5, Mongoose 9.
- Frontend production build: `.next/BUILD_ID YmwIkLf1u3VgnehocIiwt` (built 11/10, pre-existing artifact, not rebuilt for baseline).
- Backend bench: `mongodb-memory-server` isolated instance (plain standalone, no replica set). Not production MongoDB — relative comparisons only.
- Browser bench: Chromium (Playwright) vs `next start --port 3020` on loopback. No throttling applied.

## Frontend baseline (production)
- Total client JS in `.next/static/chunks/*.js`: **15.17 MB across 224 files**.
- Top chunks: **4378 / 909 / 764 / 748 KB** (heaviest = Univer+Tiptap+ExcelJS editor weight; per subagent audit Tiptap is statically imported in `app/office/document/[id]/page.tsx` and `app/office/print-preview/page.tsx`; Univer correctly `next/dynamic ssr:false`; ExcelJS/DOMPurify `await import` in handlers).
- Production loopback (`next start`, no throttling):
  - `/`: TTFB ~93ms, domContentLoaded 86ms, load 108ms, FCP 132ms, LCP 132ms, document transfer 4697 B.
  - `/rvb`: TTFB ~64ms, domContentLoaded 60ms, load 108ms, FCP 68ms, LCP 280ms, document transfer 3059 B.
- INP/CLS/long-tasks/main-thread: **not measured** (needs interaction harness + throttled run; listed as limitation).
- Route-specific JS transfer: **not attributed** (Turbopack build-manifest has no per-route byte accounting; `content-length` sums unreliable under chunked encoding — recorded 695 B sum is an artifact, not a result).

## Backend baseline (synthetic, memory server, 5000 sales, 50 customers)
- Sale filter `{customerId}` + sort, **no portal index**: full (100 rows) **11.7ms**, paged-50 **5.7ms**. Explain: `SORT` stage, docsExamined **5000**, nReturned 100, 4ms.
- Same query **with portal index** (`customerId_1_date_-1_createdAt_-1`): full **3.1ms**, paged-50 **2.0ms**. Explain: `IXSCAN`, docsExamined **100**, nReturned 100, 0ms.
- Projection `{id,date,total}`: **4.6ms** vs full-lean **2.8ms** — no gain at this row size (recorded, not optimized on).
- `countDocuments({customerId})`: **4.2ms**. Status `$group` agg: **3.6ms**.
- Request aggregation (2400 synthetic reqs, 3 collections): page1x25 **42.1ms** (total 2160), page5x25 **25.9ms**, search path **36.4ms** (0 hits for synthetic term — path cost only).
- No p95/p99/RPS/CPU/event-loop figures: single-shot `hrtime` timings on a shared Windows box, sample size 1 per case. Repeatable harness documented in `HSH_PERFORMANCE_BENCHMARKS.md`.

## Database baseline
- Index evidence above (SORT→IXSCAN, 5000→100 examined). No production explain plans (no prod access). Missing-index inventory (subagent-verified): zero `schema.index()` on sale/purchase/payment/customer/supplier/worker/product/bank-account/expense/vehicle/transfer/task/settings/sync-change models — all `findOne({id})` rely on the implicit `_id` only, not the custom `id` field. Portal runtime compounds cover 3 query+sort shapes.
- Sync bootstrap (`GET /api/sync/bootstrap`, `routes/sync.ts:98-121`): 20 collections loaded sequentially, unbounded, no pagination. Changes endpoint bounded (limit ≤500, default 200).

## Memory / resources baseline
- Backend heap across 20 repeated paged queries: **71.7 → 65.9 MB** (delta −5.8, rss −0.7) — GC normal, no leak signal at this workload.
- Frontend audit (static): one subscription-cleanup gap (`UniverWrapper.tsx:592-594` onCommandExecuted return discarded), two bare `setTimeout` navigations (`app/page.tsx:355-358`, `RvbShell.tsx:388-392`), one 600ms socket timeout (`rvb/page.tsx:1279-1281`). Candidate fixes, not yet proven leaks — need repeated-workflow heap comparison before changing.
- Browser heap over repeated navigation: **not measured** (limitation).

## Workload / methodology / limitations
- Synthetic data only; never production data. Memory server is standalone (transactions/retryable-writes unsupported — 8 pre-existing request-suite failures unrelated).
- All timings are local-loopback, single-run, unthrottled. They support before→after relative comparison on the same box, not SLA claims.
- Not measured: INP, CLS, long tasks, RPS, CPU %, event-loop lag, connection-pool behavior, production query plans, multi-client sync, native-mobile.
