# AGENTS.md — HSH Repository Instructions

Authoritative instructions for AI coding agents and developers working on HSH.
Read this file before any other work. Package notes in
`H.S.H-V2.0.0/frontend/README.md` and `H.S.H-V2.0.0/backend/README.md` are
supplementary; this file wins on any conflict. `R.V.B-mobile/` is out of scope —
never modify it without explicit user authorization.

## 1. First steps for every task

1. Read this file and the relevant guide under `docs/` (`ARCHITECTURE.md` for
   orientation, plus the topic guide for your task).
2. Run `git status --short` before touching anything. The tree is routinely dirty
   (uncommitted mission work). Never assume a clean tree.
3. Never reset, stash, clean, discard, or overwrite uncommitted changes. Preserve
   every pre-existing modification that is not yours.
4. Do not commit or push unless the user explicitly asks.

## 2. Architecture boundaries

- Frontend (`H.S.H-V2.0.0/frontend`, Next.js 16 App Router): pages → `src/services`
  → `src/services/operations` → `src/repositories` → Dexie (`src/lib/database/db.ts`).
  UI reads Dexie, never the network, for HSH data.
- Backend (`H.S.H-V2.0.0/backend`, Express 5 + Mongoose 9): `src/routes` (thin HTTP,
  auth, validation, rate limits) → `src/services` (business rules) →
  `src/models` → MongoDB. No global error middleware — every handler uses
  try/catch returning `{ success:false, code, message }`.
- HSH sync/invoice/printing routes are intentionally **unauthenticated**
  single-tenant local endpoints, disabled with `404` under `SERVER_MODE=rvb-public`.
  Do not "fix" this by adding auth; enforce the deployment binding instead.
- All `/api/rvb/*` routes require `requireRvbAuth` plus role/ownership checks.
  Frontend visibility is never a security control. `admin` is a retired role —
  canonical roles are `manager, supervisor, worker, supplier, customer`
  (`src/constants/rvb-roles.ts`).
- `/rvb` code must never import HSH Dexie (`src/lib/database/db.ts`), HSH
  repositories, or call `triggerSync()`. RVB settings flow through
  `preferences.ui` + `rvbConfigService`, not HSH settings.

## 3. Offline-first and sync invariants (do not break)

- Every HSH mutation writes Dexie **and** queues an outbox op in `syncOperations`.
  `runAsRemote()` guards remote applies against re-queueing.
- Server owns money: item `total = round(weightKg × price)`; customer lines use the
  server-authoritative `Product.price` (client totals/prices are ignored/recomputed).
- Revisions are monotonic via the atomic `SyncCounter`; `baseRevision` staleness
  rejects are correct behavior, not bugs. Preserve `clientId`/`serverRevision`/
  `operationId` handling, pending fences on every apply path, tombstone `delete`
  changes, and the `resyncRequired` guard.
- Sync evolution is additive only: new params/fields/endpoints, never changed
  semantics. Dexie schema versions are append-only.
- Pagination is opt-in: absent `page`/`limit` must run the exact legacy unbounded
  query (`parsePaging` null path). RVB catalog never leaks stock/tax internals.

## 4. Localization requirements

- Trilingual inline dictionaries (`en`, `fr`, `ar`) per page/component; Arabic is
  RTL with Latin digits forced (`ar-DZ-u-nu-latn`).
- `npm run test:i18n-parity` (`scripts/check-i18n-parity.ts`) must pass — every
  dictionary needs full `en`/`fr`/`ar` coverage. English fallback at runtime does
  not excuse missing tables.
- Never hardcode user-facing English strings in JSX for localized surfaces; never
  render raw exceptions (digest-only logging on error pages).

## 5. Security requirements

- Never commit `.env`, secrets, tokens, or credentials. QA-only fixtures use
  `RVB_TEST_MODE=true` or ephemeral `crypto.randomBytes` values.
- Escape every user string reaching `$regex` (`lib/escape-regex.ts`); coerce and
  cap every client-supplied id/array before it reaches a query.
- Authenticated rate limits are account-keyed **after** `requireRvbAuth`; pre-auth
  login/refresh limits are IP-keyed. Socket auth accepts token via `auth.token` or
  `Authorization` header — never `?token=` query.
- Chat uploads: 26 MB multer cap, 8 MB image / 25 MB video kind caps, magic-byte
  sniffing, max 3 files; production requires a configured storage provider.
- Known accepted limitations (do not re-litigate without a design):
  in-memory rate limiter (no horizontal scaling), no CSP yet, multer in-RAM
  buffering, unsigned Cloudinary URLs, bcrypt cost 10, `QA_ISOLATED` must never be
  true in production.

## 6. Financial-logic protection

- Never change sale/purchase/payment/transfer/invoice calculations without an
  equivalence test proving identical outcomes (including boundary and missing-date
  cases). Server-recomputed totals are the oracle; test fixtures must use
  server-consistent numbers (`weightKg × price`).
- Request review paths (`:id/review`, order accept) run in Mongo transactions —
  they require a replica set, including in tests (`MongoMemoryReplSet`, never a
  plain memory server).

## 7. Testing and verification before completion

- Test runner is `tsx` directly (no jest/vitest): `npx tsx <test-file>.ts` from the
  owning package directory. Frontend `@/` alias resolves only with frontend cwd.
- After any change, run at minimum: `npx tsc --noEmit` in the touched package plus
  the directly related suite(s). Before declaring major work complete, run the
  full gate: `node release-gate.mjs` from the repo root (Playwright E2E stays
  manual — see `docs/TESTING.md`).
- Never weaken assertions to green a suite. Distinguish in your report what you
  executed from what you only inspected. Never claim completion while tests remain
  red or unrun.
- Backend has no ESLint config — do not add one as a drive-by (pre-existing
  baseline would fail; it needs its own pass).

## 8. Prohibited changes

- Business logic, API behavior, dependencies/lockfiles, schemas, sync behavior,
  localization, UI components/styles — unless the task explicitly requires them.
- Anything under `R.V.B-mobile/`.
- Deleting or "archiving" documentation to avoid reading it; docs changes follow
  the structure in `README.md` (root + `docs/`, nothing else).
