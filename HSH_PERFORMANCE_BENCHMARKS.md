# HSH Performance Benchmarks (reproducible)

Environment: Windows 11, Node v22.23.2, Next 16.3.5, `mongodb-memory-server` standalone. All timings relative-only (shared box, single runs).

## 1. Frontend bundle

```powershell
Get-ChildItem H.S.H-V2.0.0/frontend/.next/static/chunks/*.js | Sort-Object Length -Descending | Select-Object -First 8 Name, @{n='KB';e={[math]::Round($_.Length/1KB)}}
Get-ChildItem H.S.H-V2.0.0/frontend/.next/static/chunks/*.js | Measure-Object -Property Length -Sum | Select-Object Count, @{n='TotalMB';e={[math]::Round($_.Sum/1MB,2)}}
npm run build --prefix H.S.H-V2.0.0/frontend
```

Expected (11/10 build): top 4378/909/764 KB; total ~15.17 MB / 224 files.

## 2. Production page timing (loopback)

```powershell
# terminal 1
npm run start -- --port 3020 --hostname 127.0.0.1   # in H.S.H-V2.0.0/frontend
# terminal 2 — Playwright script captures TTFB/dom/load/FCP/LCP per route + transferSize
$env:NODE_PATH='<repo>\H.S.H-V2.0.0\frontend\node_modules'; node check-prod-perf.cjs
```

Reference: `/` TTFB ~93ms FCP 132ms LCP 132ms; `/rvb` TTFB ~64ms FCP 68ms LCP 280ms.

## 3. Database index + paging (5000 sales, memory server)

Script shape (tsx, run in `H.S.H-V2.0.0/backend`, then delete):
seed 5000 sales over 50 customers → time `find({customerId}).sort().lean()` full vs `.limit(50)` → `explain("executionStats")` → `ensurePortalListIndexes()` → repeat → compare `winningPlan` (SORT→IXSCAN), `totalDocsExamined` (5000→100).

Reference: pre 11.7/5.7ms, post 3.1/2.0ms; examined 5000→100.

## 4. Aggregation paging (2400 synthetic requests)

Seed 800/worker+supplier+customer collections → `listAggregatedRequests({user: manager, status:"under_review", page, limit:25})` pages 1 and 5 + search path. Reference: p1 42.1ms, p5 25.9ms, search 36.4ms.

## 5. Report predicate equivalence

Seed boundary docs (fromTs/toTs inclusive, out±1, missing date) with `syncStatus:"synced"` → compare JS `.filter(s => s.date >= fromTs && s.date <= toTs)` ids vs `find({date:{$gte:fromTs,$lte:toTs}})` ids. Must match exactly (`["in1","in2"]`).

## 6. Notification batch equivalence

Seed accounts: opt-out (`notifications.requests:false`), keep, no-prefs, ghost → `createRvbNotification({audienceType:"user", audienceIds:[...], category:"requests"})` → recipients: opt-out suppressed, others delivered, ghost absent (pre-existing `resolveRecipients` filters unknown ids) → mandatory variant bypasses prefs (delivered).

## 7. Snapshot harness (supertest, memory server)

Mount `src/routes/sync` on express → seed 450 `snap-XXXX` sales → walk `GET /api/sync/snapshot?entity=sale&limit=100` to `hasMore=false` → assert union == `/bootstrap` sale ids; re-request `cursor=snap-0099` twice (identical) with first id `snap-0100`; invalid entity → 400. Reference: 5 pages, PASS.

## 8. Gates

```powershell
npx tsc --noEmit            # backend + frontend, must be clean
npm test                    # backend: pagination + unread-reuse + sync-34
npm run test                # frontend (in frontend/): parity + 4 suites
npx tsx test-chats-isolated.ts        # 52/52
npx tsx test-rvb-requests-isolated.ts # 23/31 (8 pre-existing: no replica set)
npm run build               # frontend production build green
npx eslint app/error.tsx app/global-error.tsx next.config.ts src/components/common/AppErrorPage.tsx  # clean
```
