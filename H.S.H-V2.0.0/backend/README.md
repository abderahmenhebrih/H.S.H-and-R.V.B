# HEBRIH Backend v1.1.0

Express + Mongoose + MongoDB API for Hebrih sync, printing, and persistence. Provides `POST /api/sync`, `GET /api/sync/changes`, `GET /api/sync/bootstrap`, `GET /api/sync/status`, printing (`/api/printing`), `POST /api/invoices/issue` + invoice lifecycle, health check.

## Install

```bash
cd backend
npm ci
```

Requires Node 20+, MongoDB 7+ (Atlas or self-hosted).

## Environment

Copy `.env.example` → `.env` (never commit `.env`):

```
PORT=5000
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/hebrih-slaughter-house
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development
```

- `PORT` — backend port (frontend expects `NEXT_PUBLIC_API_URL` to point here).
- `MONGODB_URI` — required. App continues without DB (printing fallback) but sync will fail until DB connects.
- `CORS_ORIGIN` — comma-separated allowed frontend origins. Dev `http://localhost:3000`, prod `https://your-frontend.example.com`.
- `NODE_ENV` — `development` / `production`.

## Scripts

```bash
npm run dev    # tsx src/server.ts
npm run build  # tsc → dist/
npm run start  # node dist/server.js
```

No file outside `backend/` is required at runtime (`dist/server.js` is entry).

## Printing

Reports/Invoice printing uses `puppeteer-core` + `pdf-to-printer`. On Windows it may invoke PowerShell/pdf-to-printer. Keep dependencies as-is; Windows-specific behavior is intentional — document platform limitation if deploying to Linux (printer may need alternate driver).

## Deployment notes

- `dist/` and `node_modules/` are not committed (see `.gitignore`).
- Real `.env` never shipped — only `.env.example`.
- Version `1.1.0` in `package.json` and `package-lock.json`.
- Offline-first frontend still reads local IndexedDB when backend unavailable; sync resumes when online.

## Features (V1.1.0)

- **My Office** — `officeFiles` model + `OfficeFile` sync, placeholder/template engine.
- **Invoice** — `Invoice`/`InvoiceSellerProfile`/`InvoiceTaxProfile`/`IncomingInvoice` with seller sequence, atomic `POST /api/invoices/issue`, draft/issued/cancelled, sync/change-log.

## Sync architecture (v1.1.0)

IndexedDB: Dexie `syncOperations`, `syncMeta` (clientId, serverRevision), `syncConflicts`, all business tables + `notifications`. `operationId`/`clientId`/`baseRevision` per op, `push/pull/bootstrap` with empty-bootstrap reconciliation (`serverRevision` advances even when snapshot empty), `ProcessedSyncOperation` terminal/ retryable handling, deterministic `sourceEventId → notificationId` dedup, Mongo transactions.
