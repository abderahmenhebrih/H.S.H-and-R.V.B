# Security

## Authentication model

- **HSH has no login by design.** `/api/sync`, `/api/printing`, `/api/invoices` are
  single-tenant local endpoints with no auth gate. This is deliberate architecture,
  not a gap: exposure is controlled by deployment binding (CORS allowlist +
  `SERVER_MODE`; production `full` mode refuses to start without explicit opt-in).
- **RVB uses JWT + rotating refresh.** Access token (default 15 m) via
  `Authorization: Bearer`, `rvb_access_token` cookie, or `X-RVB-Token`. Refresh
  (default 30 d) via `HttpOnly` cookie (web) or JSON/`X-Refresh-Token` (native);
  rotation is an atomic find-and-update creating a new session in the same
  `rotationFamilyId`. Every request revalidates the account (`active`, else
  `RVB_ACCOUNT_ARCHIVED`/`DISABLED`) and the session (`revokedAt: null`,
  `expiresAt > now`, else `RVB_SESSION_REVOKED`). Frontend keeps the access token
  in memory only and retries once through a single shared refresh on 401.
- Passwords: bcrypt cost 10 with length/confirm policy (≥ 8, ≤ 128). Password
  change revokes all other sessions and rotates the current one; logout revokes
  and disconnects the session's sockets.

## Role model and data isolation

Canonical roles: `manager`, `supervisor`, `worker`, `supplier`, `customer`
(`admin` retired → `manager`; rejected for new accounts). Management routes
require `requireRvbRole`; every portal route derives `linkedEntityId` from
`req.rvbUser` and returns `403 RVB_FORBIDDEN` on mismatch — client-supplied ids
are never trusted. History endpoints use projections, never unfiltered reads.
Catalog DTOs expose only `{ id, name, price, description, available }`; exact
stock, `taxProfileId`, and sync internals never leak. Portal self-service DTOs
omit `syncStatus`/`serverRevision`/`lastSyncedAt`.

Frontend role checks (guards, hidden navigation, `FRONTEND_MODE=rvb-public`
routing) are UX only; every check is re-enforced server-side.

## Socket security

Handshake mirrors HTTP auth (token via `auth.token` or `Authorization` header;
`?token=` query rejected). Rooms are per-user/per-session/per-role plus
membership-checked conversation rooms; `chat:leave` can only leave joined
conversation rooms; `chat:typing` is throttled (1/s/socket) with membership
re-check; 5 sockets per account (oldest evicted). Logout/revoke/disable triggers
server-side disconnect helpers.

## File security

Chat attachments: multer memory transport, 26 MB hard cap, 1 file per request;
kind caps 8 MB image / 25 MB video (overridable via `CHAT_*_MAX_BYTES`);
magic-byte sniffing (JPEG/PNG/WebP/MP4/QT/WebM) + image-dimension parsing without
native deps; max 3 attachments per message; membership re-checked before and
during upload. Storage resolves to `CHAT_STORAGE_PROVIDER` if set, else mock in
tests, Cloudinary when credentials exist, local-dev otherwise — **production with
no provider configured rejects uploads** (`503 RVB_MEDIA_NOT_CONFIGURED`).
Orphaned uploads expire after 24 h and are swept by a bounded 6 h background job.

## Input handling

- Every user string reaching `$regex` is escaped (`lib/escape-regex.ts`) with an
  80-char cap; client-supplied ids are string-coerced and length-gated; array
  inputs are capped (`$in` ≤ 500 members, `sourceSaleIds` ≤ 200, items 1–50).
- Money is server-computed (`total = round(weightKg × price)`); customer prices
  are overwritten from authoritative `Product.price`.
- Invoice error paths return generic `INTERNAL_ERROR` on 500 (duplicate 409
  branches preserved); error pages never render raw exceptions.

## Secrets handling

Never commit `.env`, tokens, or credentials (both packages gitignore them; only
`.env.example` files ship). JWT secrets are required in production (boot throws
without them); generate with `node -e
"console.log(require('crypto').randomBytes(48).toString('hex'))"`. Tests use
`RVB_TEST_MODE=true` or ephemeral `crypto.randomBytes(48)` values — committed QA
secrets were eliminated; remaining test-only constants are harness entry points
only (`lib/rvb-auth.ts` throws in production without real secrets). Mobile stores
refresh tokens in OS secure storage (Keychain/Keystore), never `AsyncStorage`.

## Security testing

Covered by `test-failure-injection.ts` (malformed/auth/replay/adversarial shapes),
`test-authz-matrix.ts` (15/15: role gates, portal scoping, inactive accounts,
cross-user no-leak), and the chat/request suites. Run them via
`node release-gate.mjs`; see `docs/TESTING.md`.

## Known limitations (accepted — require dedicated designs, not drive-bys)

- Rate limiter is in-memory: restarts reset buckets; horizontal scaling bypasses
  it. A Redis-backed limiter is future work.
- No Content-Security-Policy yet (API serves HTML/PDF on some routes; needs
  per-route analysis). `X-Frame-Options: DENY` + HSTS are set.
- Multer buffers uploads in RAM (bounded); disk offload is future work.
- Chat media served by permanent (unsigned) Cloudinary URLs; signed-URL migration
  touches mobile clients and needs its own design.
- Customer create/update length/format validation is intentionally loose
  (behavior-sensitive flows); tightening needs parity tests.
- `QA_ISOLATED=true` relaxes login/refresh rate limits and must never be set in
  production (localhost-URI guard + deployment docs enforce this).
- A historical credential in `R.V.B-mobile/` git history is outside HSH scope;
  rotation by the repository owner is recommended.
