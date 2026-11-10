# Development

## Prerequisites

- Node.js 20 or later.
- MongoDB 7+ as a **replica set** — transactions back sync push and request
  reviews. A standalone server breaks those paths (proven by test failures on a
  plain memory server). For local work the `mongodb-memory-server` replica-set
  harness is used automatically by the test suites.
- Ports: backend `5000`, frontend `3000` (RVB QA stack uses `5001`/`3001`).

## Installation

```powershell
cd H.S.H-V2.0.0/backend
npm ci
Copy-Item .env.example .env   # then set MONGODB_URI (required)

cd ../frontend
npm ci
Copy-Item .env.example .env.local   # default NEXT_PUBLIC_API_URL=http://localhost:5000 works locally
```

Never commit `.env` / `.env.local` (gitignored; only `.env.example` ships).

## Environment reference

Backend (`H.S.H-V2.0.0/backend/.env.example` — authoritative; required values
throw at production boot when missing):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | Backend listen port |
| `MONGODB_URI` | — (required) | MongoDB connection string |
| `CORS_ORIGIN` | `http://localhost:3000,http://localhost:8081` | Comma-separated allowed origins (credentials on, no wildcard) |
| `RVB_JWT_ACCESS_SECRET` / `RVB_JWT_REFRESH_SECRET` | — (required in production) | Signing secrets (≥ 32 chars; generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `RVB_ACCESS_TOKEN_TTL` / `RVB_REFRESH_TOKEN_TTL` | `15m` / `30d` | Token lifetimes |
| `SERVER_MODE` | `full` | `full` (HSH + RVB) vs `rvb-public` (RVB only; `/api/sync\|printing\|invoices` → 404) |
| `ALLOW_FULL_SERVER_IN_PRODUCTION` | unset | Must be `true` to run `full` with `NODE_ENV=production` |
| `TRUST_PROXY` | `0` | Reverse-proxy trust for rate-limit IPs |
| `NODE_ENV` | `development` | `development` / `production` |
| `MONGODB_DNS_SERVERS` | unset | Optional DNS override for MongoDB SRV |
| `CHAT_STORAGE_PROVIDER` | auto | `cloudinary` \| `local-dev` \| `mock` (production with no Cloudinary creds rejects uploads) |
| `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`, `CLOUDINARY_CHAT_FOLDER` | unset / `rvb/chat` | Production chat media |
| `CHAT_IMAGE_MAX_BYTES` / `CHAT_VIDEO_MAX_BYTES` | 8 MB / 25 MB | Upload kind caps |
| `CHAT_UPLOAD_CLEANUP_INTERVAL_MS`, `DISABLE_CHAT_UPLOAD_CLEANUP` | 6 h / unset | Orphan-upload sweeper tuning |

Frontend (`H.S.H-V2.0.0/frontend/.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:5000` | Backend origin for sync client and RVB API |
| `FRONTEND_MODE` (`NEXT_PUBLIC_FRONTEND_MODE` alias) | `full` | `full` vs `rvb-public` (routing gate in `proxy.ts`; pair with backend `SERVER_MODE`) |

Deployment pairs: trusted local/LAN = `full`/`full`; public/mobile =
`rvb-public`/`rvb-public`. Never set `QA_ISOLATED=true` outside local QA.

## Running locally

```powershell
# Terminal 1 — backend
cd H.S.H-V2.0.0/backend
npm run dev        # tsx src/server.ts → http://localhost:5000

# Terminal 2 — frontend
cd H.S.H-V2.0.0/frontend
npm run dev        # next dev → http://localhost:3000
```

Useful scripts: `npm run build` (`tsc` backend / `next build` frontend),
`npm start` (serve production build), `npm run typecheck` (`tsc --noEmit`,
both), `npm run lint` (frontend eslint), `npm run test:i18n-parity` (frontend),
`npm run test:hsh-sync` (backend sync integrity), `rvb:bootstrap-manager`
(backend manager seeding). Full command matrix: `docs/TESTING.md`.

## Development workflow

1. `git status --short` — know what is already dirty before you start.
2. Read `AGENTS.md` + the relevant `docs/` guide.
3. Keep changes scoped: frontend pages → services → operations → repositories →
   Dexie; backend routes → services → models. No global error middleware exists —
   handle errors per route with `{ success:false, code, message }`.
4. Offline-first discipline: HSH mutations write Dexie + queue an outbox op; read
   back from Dexie. RVB code stays off HSH Dexie entirely.
5. Trilingual discipline: every user-facing string needs `en`/`fr`/`ar`
   (`npm run test:i18n-parity` gates this); Arabic layouts must stay RTL with
   Latin digits.
6. Verify: `npx tsc --noEmit` in the touched package + related suite(s); full
   gate `node release-gate.mjs` before declaring major work done.

## Common troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Backend warns `sync will fail until DB connects` | `MONGODB_URI` unset/unreachable; dev continues for printing fallback, sync needs DB |
| `Refusing to start: SERVER_MODE=full ...` in production | Set `SERVER_MODE=rvb-public` or `ALLOW_FULL_SERVER_IN_PRODUCTION=true` |
| `DB_NOT_READY` on `/api/ready`, 503s | Mongoose not connected (`readyState !== 1`); check URI/DNS (`MONGODB_DNS_SERVERS`) |
| Transaction errors in tests (`TransientTransactionError`, request-review failures) | Plain memory server instead of `MongoMemoryReplSet` — use the replica-set harness |
| Sync never converges / stale reads | Check `syncMeta.serverRevision` vs `/api/sync/status`; look for `resyncRequired` and `syncConflicts` growth |
| 401 `RVB_SESSION_REVOKED` loop on mobile/web | Clear stored tokens and re-login; check `rvb-session` `revokedAt`/`expiresAt` |
| 429 `RATE_LIMITED` during manual testing | Per-account backstop tripped; wait out the window; never enable `QA_ISOLATED` in shared envs |
| `RVB_MEDIA_NOT_CONFIGURED` on upload | No storage provider configured (production) — set `CHAT_STORAGE_PROVIDER` / Cloudinary creds |
| Playwright suites collide on ports | Stacks must not share ports: main `:3000/:5000`, RVB `:3001/:5001`; run suites sequentially |
| Frontend `@/` imports fail in a harness | `@/` resolves only with frontend cwd — keep Dexie harnesses under `frontend/` |
