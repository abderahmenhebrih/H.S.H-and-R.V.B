# HEBRIH Frontend v1.1.0

Offline-first Next.js 16 management UI for Hebrih Slaughter House (Inventory, Sales, Purchases, Payments, Workers, Tasks, Reports, Invoice, My Office, Notifications).

## Install

```bash
cd frontend
npm ci
```

Requires Node 20+.

## Environment

Copy `.env.example` → `.env.local` (never commit `.env.local`):

```
NEXT_PUBLIC_API_URL=http://localhost:5000
```

- Development default `http://localhost:5000` matches `backend/.env.example` `PORT=5000`.
- Production: `NEXT_PUBLIC_API_URL=https://your-backend.example.com` (no hardcoded prod URL).

Frontend reads IndexedDB/Dexie locally; sync talks to `NEXT_PUBLIC_API_URL` via HTTP. Works offline when backend unavailable (local reads, queued `syncOperations`).

## Scripts

```bash
npm run dev    # next dev  (http://localhost:3000)
npm run lint   # eslint
npm run build  # next build
npm run start  # next start (after build, PORT=3000 by default)
```

No file outside `frontend/` is required at runtime.

## Deployment notes

- Build output `.next/` is not committed (see `.gitignore`).
- Real env files (`.env`, `.env.local`, `.env.production.local`) are never shipped — only `.env.example`.
- Version `1.1.0` in `package.json` and `package-lock.json`.

## Features (V1.1.0)

- **My Office** — Integrated document/spreadsheet workspace (`/office`) with file manager, templates, KPIs, and synced office files.
- **Notifications** — In-app notification center (`/notifications`) with sync-aware `NotificationBell` and `syncOperations` integration.
- **Invoice** — New architecture: `Invoice`/`InvoiceSellerProfile`/`InvoiceTaxProfile`/`IncomingInvoice` models, seller sequence allocation, atomic issue transaction (`POST /api/invoices/issue`), draft vs. issued vs. cancelled lifecycles, print/export.
- **Sync** — Dexie `syncOperations`/`syncMeta`/`ProcessedSyncOperation`, `clientId`/`serverRevision`/`operationId` push/pull/bootstrap with empty-bootstrap reconciliation, deterministic notification dedup, Mongo transactions.
