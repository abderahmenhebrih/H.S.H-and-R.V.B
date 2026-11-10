# Testing

Test runner is `tsx` invoked directly (no jest/vitest). Harnesses follow one
pattern: `async main()` + `record/pass/fail` + `process.exit(failed ? 1 : 0)`.
Browser E2E uses Playwright.

## Command matrix (verified against `package.json` scripts and `release-gate.mjs`)

| Layer | Command | Working directory |
|---|---|---|
| Typecheck (both) | `npx tsc --noEmit` | `H.S.H-V2.0.0/backend`, `H.S.H-V2.0.0/frontend` |
| Backend unit gates | `npm test` → `test-pagination.ts` + `test-chat-unread-reuse.ts` + `test-hsh-sync-integrity.ts` | `H.S.H-V2.0.0/backend` |
| Frontend unit gates | `npm test` → `check-i18n-parity.ts` + `test-notification-i18n.ts` + `test-notification-presentation.ts` + `test-date-format.ts` + `test-compact-number.ts` | `H.S.H-V2.0.0/frontend` |
| Sync integrity (34) | `npx tsx test-hsh-sync-integrity.ts` (also `npm run test:hsh-sync`) | backend |
| HSH client integrity | `npx tsx test-hsh-sync-client-integrity.ts` (`npm run test:hsh-client`) | frontend |
| Requests isolation (39) | `npx tsx test-rvb-requests-isolated.ts` | backend |
| Chat isolation (52) | `npx tsx test-chats-isolated.ts` | backend |
| Failure injection | `npx tsx test-failure-injection.ts` (mongo-down, malformed, auth, concurrent, replay, atomicity, shapes) | backend |
| Authz matrix (15) | `npx tsx test-authz-matrix.ts` (role gates, portal scoping, inactive, cross-user no-leak) | backend |
| Backup round-trip (2) | `npx tsx test-backup-restore.ts` (seed 200 → drop → restore → counts + spot-checks) | backend |
| Snapshot migration (18) | `npx tsx test-sync-snapshot-migration.ts` (fresh/existing/empty/paged/interrupt/disconnect/rerun/resume/duplicate/concurrent/pending/conflict/deletion/partial/legacy + resync guard) | frontend |
| HSH browser E2E (11) | `playwright test --config=playwright.config.ts e2e/` (also `npm run qa:user` for `e2e/autonomous`) | frontend |
| HSH i18n browser | `playwright test --config=playwright.i18n.config.ts` (also `npm run qa:i18n`) | frontend |
| RVB browser E2E (4) | `playwright test --config=playwright.rvb.config.ts` / `playwright.i18n.rvb.config.ts` | frontend |

## Release gate

```powershell
node release-gate.mjs                 # everything: typechecks → suites → frontend build
node release-gate.mjs --skip-build    # skip production build
node release-gate.mjs --skip-snapshot # skip snapshot-migration suite
```

Exit 0 = all green; non-zero = first failing layer name. Playwright E2E is
intentionally **not** in the gate — it needs dedicated seeded stacks (see below)
and stays a manual step.

## Environment rules

- **Replica set is mandatory** for transaction paths. Harnesses must use
  `MongoMemoryReplSet.create({ replSet: { count: 1 } })` — a plain memory server
  fails request reviews and sync push (proven, not flaky).
- **Never share ports between stacks.** Main: backend `qa-server :5000` +
  frontend `:3000`. RVB: `rvb-qa-server :5001` + frontend `:3001`. One Next dev
  server per frontend directory; run suites sequentially. The i18n HSH config has
  no `webServer` and reuses running servers.
- Frontend `@/` alias resolves only with frontend cwd — Dexie harnesses that need
  backend modules live under `frontend/` and import backend relatively.
- Fixtures must use server-consistent numbers (`total = weightKg × price`;
  customer lines at `Product.price`); never weaken assertions to green a suite.
- Secrets in tests: `RVB_TEST_MODE=true` or ephemeral values only.

## Performance budgets and evidence

Reference box: Windows 11, Node 22, `mongodb-memory-server`, synthetic data,
single-run loopback timings — relative evidence for regression comparison, not
SLAs. Budgets (a regression beyond 2× fails the gate's spirit; re-baseline on a
new box before enforcing):

- Indexed portal page(50) at 100 k docs: p50 ≤ 10 ms, p95 ≤ 30 ms.
- `countDocuments` per-customer at 100 k: p95 ≤ 200 ms.
- Sync push throughput ≥ 30 ops/s; changes page(200) p95 ≤ 250 ms.
- Snapshot migration of 2 k docs end-to-end ≤ 5 s loopback.

Supporting evidence recorded during prior missions: 100 k-sale A/B without the
portal index (COLLSCAN+SORT, p50 ~317 ms) vs. with it (IXSCAN, p50 ~4 ms, ~77×);
sync POST of 300 ops at 32–67 ops/s with full drain; 2 k-doc migration in ~1.2 s;
backend heap stable across 500+ sampled queries (GC normal, no leak signal);
frontend production bundle ~15.17 MB / 224 chunks (heaviest chunk ~4.4 MB:
Univer + TipTap + ExcelJS editor weight, route-split). Reproducible recipes
(bundle inventory via `Get-ChildItem .next/static/chunks`, loopback timing via
`next start --port 3020` + Playwright, 5 k-sale index A/B with
`explain("executionStats")`, aggregation/predicate/notification equivalence
harnesses) were consolidated from the former benchmarks guide; re-derive them on
the current box rather than treating old numbers as guarantees.

Not measured (honest gaps): concurrent-load RPS, CPU/event-loop profiling,
browser INP/CLS/LCP under throttling, 500 k scale, production query plans, native
mobile. No load harness exists; prescribing one is future work.

## Known environment constraints

- Backend has no ESLint config — intentionally not added (pre-existing baseline
  would fail; needs its own pass). Frontend `npm run lint` covers the frontend.
- Windows cannot deliver POSIX signals, so graceful-shutdown behavior is
  code-reviewed and must be proven on Linux CI (see `docs/DEPLOYMENT.md`).
- Stale-port confusion (`:3010` seen in past missions) is documentation-only
  noise: the only canonical ports are `3000/5000` (+ `3001/5001` RVB QA).
