# Deployment

## Prerequisites

- Node.js 22 (reference production runtime; development requires 20+).
- MongoDB 7+ as a **replica set** — standalone servers break transactional paths
  (request reviews, sync push).
- Backend `PORT` (default 5000) and frontend port (3000) reachable per topology;
  lockfiles are committed — install with `npm ci` only.

## Environment

Production boot throws unless `MONGODB_URI`, `RVB_JWT_ACCESS_SECRET`, and
`RVB_JWT_REFRESH_SECRET` are set. Full variable reference: `docs/DEVELOPMENT.md`.

| Decision | Setting |
|---|---|
| Trusted local/LAN (HSH + RVB) | `SERVER_MODE=full` + `FRONTEND_MODE=full` |
| Public/mobile (RVB only) | `SERVER_MODE=rvb-public` + `FRONTEND_MODE=rvb-public` (HSH routes 404, HSH UI redirects to `/rvb`) |
| `full` + `NODE_ENV=production` | Requires `ALLOW_FULL_SERVER_IN_PRODUCTION=true` or the server refuses to start |
| `CORS_ORIGIN` | Must list the real frontend origin(s); frontend build needs `NEXT_PUBLIC_API_URL` pointing at the backend origin |
| Never in production | `QA_ISOLATED=true` (relaxes login rate limits) |

## Build and start

```powershell
# Backend
cd H.S.H-V2.0.0/backend
npm ci
npm run build   # tsc → dist/
node dist/server.js   # or: npm start

# Frontend
cd H.S.H-V2.0.0/frontend
npm ci
npm run build   # next build
npm start       # next start (PORT=3000 default)
```

`dist/`, `.next/`, `node_modules/`, and real `.env` files are never committed.

## Startup verification

Watch logs for the `ensure*` index lines (warnings are loud, never silent).
Verify compound indexes exist — without the portal compounds, portal reads
degrade ~77× at scale (see `docs/TESTING.md`):

```js
db.sales.getIndexes()        // expect customerId_1_date_-1_createdAt_-1
db.purchases.getIndexes()    // expect supplierId_1_date_-1_createdAt_-1
db.payments.getIndexes()     // expect entityType_1_entityId_1_date_-1_createdAt_-1
db.customer_orders.getIndexes() // expect unique partial (accountId, clientRequestId)
```

The customer-order idempotency index is a fatal boot check; the portal/chat/
notification index hooks are best-effort (loud warnings).

## Health, readiness, and monitoring

- Liveness `GET /api/health` → always 200. Readiness `GET /api/ready` → 200 only
  with a live database (`readyState === 1`), else 503 `DB_NOT_READY`. Gate traffic
  on readiness.
- Every `/api/*` response carries `X-Request-Id`; sync error logs include it —
  correlate client/server logs by it. Alert on: readiness flaps, `Sync request
  failed` bursts, `resyncRequired` occurrences, `syncConflicts` growth, aging
  `syncOperations` backlog, `RVB_RATE_LIMIT` spikes, shutdown-drain timeouts.

## Logging

No external log shipper is configured. Backend logs to stdout (`Sync request
failed` / `Bootstrap failed` / `Snapshot failed` with request ids, index-hook
warnings, refusal errors). Frontend logs sync-cycle progress to the console and
error digests only on error pages. Production deployments should capture stdout
per process and add rotation/retention at the platform layer.

## Backup and restoration

- **MongoDB:** `mongodump --uri="$MONGODB_URI" --out=/backups/<date>` (+ oplog
  for point-in-time). Restore into an **isolated** instance first, run
  `node release-gate.mjs` against it, then `mongorestore`. Round-trip mechanics
  are covered by `backend/test-backup-restore.ts` (in isolation, not against
  production data).
- **Dexie (client devices):** no server backup needed; reinstalls re-migrate via
  the chunked snapshot protocol (`docs/SYNCHRONIZATION.md`).
- No automated backup scheduling exists in this repository — scheduling is an
  operator responsibility at the platform layer.

## Rollback

All migrations to date are additive (indexes, optional params, additive
endpoint/fields). Roll back by redeploying the previous commit and restarting —
there is no destructive step to undo. Caution: clients that opened a newer Dexie
version keep extra tables harmlessly (unknown tables are ignored); do not
downgrade Dexie code below the data version in use without testing.

## Shutdown

`SIGTERM`/`SIGINT` → background processors stop (chat reminders, upload cleanup)
→ HTTP drains → Mongoose disconnects → `exit(0)`, with a 10 s forced fallback.
Shutdown behavior is code-reviewed; POSIX signals cannot be delivered on Windows,
so proof belongs to Linux CI/staging. Never kill -9 a draining instance unless
the 10 s fallback has fired.

## Operational troubleshooting

| Symptom | Action |
|---|---|
| Readiness 503s, traffic shed | DB down: app continues offline-first locally; on recovery the outbox drains and `/changes` catches up (duplicate-safe, idempotent) |
| Post-deploy failure | Gate must pass pre-deploy (`release-gate.mjs`); on post-deploy failure roll back per above |
| Secret rotation (JWT) | Set new values, restart; sessions re-login |
| Secret rotation (Atlas) | Rotate in Atlas, update `MONGODB_URI`, restart |
| Conflict diagnosis | Inspect `syncConflicts` (outcomes) and `processed-sync-operations` (replay diagnostics) |
| Floods / abuse | Check `RVB_RATE_LIMIT` rate; limits are in-memory per instance (see `docs/SECURITY.md`) |
