# TEMP-PBS-BUG-035-AUDIT (PBS-BUG-035 — socket session/token recovery)

Cycle scope: PBS-BUG-035 ONLY. PRE-FIX parent commit: `72d1fc2` (master, "052").
PBS-BUG-028/029/030/032/034 are CLOSED; their production code is preserved and
untouched (scope proof in sec 80-81).

## 1. Bug definition

RVB Web realtime chat did not recover when its socket auth went stale:
(a) an HTTP refresh rotating session S1→S2 made the backend disconnect the
old-session socket, and the client never reconnected (dead chat on a live
session); (b) any re-handshake with the superseded token failed with
`RVB_SESSION_REVOKED`, which the old `connect_error` handler did not
recognize; (c) the only recovery path (`connectChatSocket()` fresh instance)
orphaned the page's already-bound event listeners.

## 2. Historical claim

Old audit: the service handled only `RVB_TOKEN_INVALID`/`RVB_UNAUTHENTICATED`
in `connect_error`, while the backend could also emit `RVB_SESSION_REVOKED`,
`RVB_ACCOUNT_ARCHIVED`, `RVB_ACCOUNT_DISABLED`, plus an (incorrect) claim that
access expiry emits `RVB_TOKEN_EXPIRED` from socket middleware.

## 3. Re-audit correction about token expiry

WITHDRAWN expiry claim is correct and locked at runtime: an expired access JWT
fails `verifyAccessToken()` inside the socket middleware's try/catch, which
returns `next(new Error("RVB_TOKEN_INVALID"))` (chat-socket.ts:85-89). Runtime
B2 confirms the client sees exactly `msg=RVB_TOKEN_INVALID`. No
`RVB_TOKEN_EXPIRED` handling was added. `RVB_TOKEN_EXPIRED` remains an HTTP
refresh-path code only.

## 4. Current chat-socket service architecture

Pre-fix `frontend/src/services/chat-socket.service.ts` (52 lines): module
singletons `socket`/`listenersBound` (latter dead); `getChatSocket()`;
`connectChatSocket()` (null without memory token; returns connected instance;
else disconnects + replaces + creates `io()`); `disconnectChatSocket()`
(disconnect + null). Post-fix adds bounded single-flight recovery helpers;
config and public API shape unchanged.

## 5. Socket.IO configuration

Unchanged by this cycle: `path: "/api/rvb/chats/socket"`, `auth: {token}`,
`withCredentials: true`, `transports: ["websocket","polling"]`,
`reconnection: true`, `reconnectionAttempts: 10`, `reconnectionDelay: 800`.
No autoConnect override (default true), no backoff customization.

## 6. Current connect_error handler

Pre-fix: message-substring match on `RVB_TOKEN_INVALID`/`RVB_UNAUTHENTICATED`
only → `rvbAuthService.refresh()` → set `socket.auth` → manual `connect()`;
all failures swallowed. `RVB_SESSION_REVOKED`/`RVB_ACCOUNT_ARCHIVED`/
`RVB_ACCOUNT_DISABLED` unrecognized. Post-fix (sec 43-47): structured-first
matcher, SESSION_REVOKED routed to shared recovery, ARCHIVED/DISABLED halt
with no refresh, unknown codes untouched.

## 7. Current disconnect handler

Pre-fix: NONE (only page-level UI flags). Post-fix: service-level listener
that recovers solely on reason `"io server disconnect"` (rotation signature);
all other reasons keep default behavior. Empirical reason table in sec 14.

## 8. Current recognized code list

Post-fix: `RVB_TOKEN_INVALID`, `RVB_UNAUTHENTICATED`, `RVB_SESSION_REVOKED`
(recoverable-or-superseded → shared recovery); `RVB_ACCOUNT_ARCHIVED`,
`RVB_ACCOUNT_DISABLED` (terminal → halt, never refresh). `RVB_TOKEN_EXPIRED`:
deliberately ABSENT — proven NOT EMITTED BY CURRENT SOCKET MIDDLEWARE
(sec 3/12).

## 9. Client error-object shape

Runtime-proven (B7/B2/B10/B11): `connect_error` carries
`message = "CODE"`, `data = undefined`, `code = undefined`, e.g.
`msg=RVB_SESSION_REVOKED data=undefined code=undefined`. Backend rejects with
`next(new Error(CODE))` (message-only protocol). The fix therefore prefers
structured `data.code`/`code` when present but falls back to message matching
— NOT a protocol refactor, just a tolerant reader (rule A3 satisfied without
backend changes).

## 10. Backend socket middleware

`backend/src/lib/chat-socket.ts:79-111` (complete read): token from
`handshake.auth.token` or `authorization` header (Bearer-prefix stripped);
missing → `RVB_UNAUTHENTICATED`; `verifyAccessToken` throw (malformed OR
expired) → `RVB_TOKEN_INVALID`; account missing → `RVB_UNAUTHENTICATED`;
`archived` → `RVB_ACCOUNT_ARCHIVED`, else non-active → `RVB_ACCOUNT_DISABLED`;
missing/revoked/expired session (incl. absent `sessionId`) →
`RVB_SESSION_REVOKED`; else attaches `rvbUser` and joins
`user:{id}` / `session:{id}` / `role:{role}` rooms + member conversations.

## 11. Backend socket error matrix

| condition | connect_error message | HTTP analogue | recoverable by new token? | terminal? |
|---|---|---|---|---|
| missing token | RVB_UNAUTHENTICATED | 401 same | yes (login/refresh) | no |
| malformed JWT | RVB_TOKEN_INVALID | 401 same | yes | no |
| expired access JWT | RVB_TOKEN_INVALID | 401 same | yes | no |
| unknown account | RVB_UNAUTHENTICATED | 401 same | no | yes-ish* |
| archived | RVB_ACCOUNT_ARCHIVED | 403 same | no | yes |
| disabled | RVB_ACCOUNT_DISABLED | 403 same | no | yes |
| missing sessionId | RVB_SESSION_REVOKED | 401 same | maybe (superseded) | context |
| revoked/expired session | RVB_SESSION_REVOKED | 401 same | maybe (superseded) | context |
| valid | (connects) | — | — | — |

*Unknown account has no valid refresh session either; recovery refresh fails
terminal and stops (B9 pattern).

## 12. Expired-JWT actual socket code

`RVB_TOKEN_INVALID` — source (`verifyAccessToken` throw → generic catch) AND
runtime (B2 `msg=RVB_TOKEN_INVALID`, recovered via 1 refresh). Correction
locked; no expiry-code work claimed.

## 13. safeDisconnectSession implementation

`chat-socket.ts:14-32`: prefers `io.in("session:{id}").disconnectSockets(true)`
(room exists — sockets join `session:` on connection, line 121); fallback
iterates sockets matching `data.rvbUser.sessionId` → `sock.disconnect(true)`.
Refresh route calls it with the OLD session id AFTER creating S2 (sec 15).
`disconnectRvbAccount(Except)` variants exist for logout/change-password
scope control; untouched.

## 14. Socket.IO server-disconnect semantics

Runtime-measured in THIS stack (server+client 4.8.x, current config):
1. transport loss (`engine.close()`) → `disconnect "forced close"` →
   `reconnect_attempt` → auto-reconnect, no refresh (B12).
2. server `disconnectSockets(true)`/`sock.disconnect(true)` → client
   `disconnect "io server disconnect"` → NO auto-reconnect (`reattempt=0`),
   NO `connect_error` (B6 pre-fix).
3. middleware rejection → single `connect_error`, NO manager retry
   (`cerr=1`, `reattempt=0` in B7/B9/B10/B11/B14) — observed, not assumed.
4. manual `socket.disconnect()` → `"io client disconnect"`, no auto-retry.
5. manual `socket.connect()` after (4) → fresh handshake (F4 probe works).

## 15. Refresh-rotation ordering

`POST /api/rvb/auth/refresh` (routes/rvb-auth.ts:225-328): validate cookie JWT
→ atomically revoke old session → create S2 → set refresh cookie →
`safeDisconnectSession(S1)` → respond (S2 + A2). Frontend stores A2 when the
HTTP response is processed — i.e. the server disconnect for S1 may arrive
BEFORE or AFTER A2 lands in memory (race documented; fix covers both via
fast-path + 400ms re-check, sec 44).

## 16. Current web auth token architecture

028: `authFetch` + shared `getRefreshPromise` (one retry). 029:
`restoreSessionFromCookie` RVB-surface probe. 030: `isTerminalRvbAuthError`
(8-code set) gating `loadMe` cleanup and `notifyAuthFailure`. Socket service
consumes ONLY `getAccessToken()` (read) and the shared `refresh()` (repair);
never `clearLocal`, never notify, never private refresh. Memory token remains
the single rotation channel.

## 17. Current socket caller inventory

- `app/rvb/chats/page.tsx:430` `connectChatSocket()` in socket-setup effect
  (+`:421/:550/:564/:565` `getChatSocket()` for join/typing).
- `app/rvb/page.tsx:1135` + `connect`/`disconnect` UI flags, effect on `[user]`.
- `app/rvb/notifications/page.tsx:354` + `rvb:notification` listener.
- `components/rvb/RvbShell.tsx:360` + `rvb:notification` listener, effect `[]`.
- `components/notifications/RvbNotificationBell.tsx:173` + `rvb:notification`.
No caller passes a token explicitly (service reads memory); no caller
re-runs on token change; none unmount-disconnects except effect cleanups
(`off`, not `disconnect`). All rely on the singleton instance identity.

## 18. Token-change propagation

Pre-fix: NONE. After HTTP refresh stored A2, no effect/service touched the
live socket (`socket.auth` stayed A1 until a fresh `connectChatSocket()`
replaced the whole instance). B6 proves it (`sameAsBefore=true`, dead
socket). Post-fix: recovery applies the current token to the live instance
(B6 `sameAsBefore=false`, connected).

## 19. Current chat listener inventory

Chats page (effect deps `[selectedId, loadConversations]`, binds to the
returned singleton, `off` on cleanup): `connect`, `disconnect`,
`chat:newMessage/Edited/Deleted`, `chat:reactionUpdated`, `chat:readReceipt`,
`chat:typing`, `chat:pinnedUpdated`, `chat:unreadUpdate`. Plus
`rvb:notification` in RvbShell/Bell/notifications-page. Recovery preserves all
by NEVER replacing the instance (F15/F16 proofs).

## 20. PBS-BUG-028/029/030 boundaries

028: `authFetch`/shared refresh untouched (F18 proof). 029:
`restoreSessionFromCookie`/bootstrap untouched. 030: classifier untouched;
socket recovery never destroys durable state — transient refresh failure
preserves hint (B13 `hint=1->1`); terminal refresh failure stops without
clearing (B14 `hint=1`, HTTP layer owns cleanup on next contact — documented
in sec 74, not a regression: pre-fix behavior identical).

## 21. Runtime environment

Real backend (express + real `rvb-auth` router + real `initChatSocket`
middleware on ephemeral port, real models/JWT/sessions, MongoMemoryReplSet,
`RVB_ACCESS_TOKEN_TTL` shortenable per-test) + REAL frontend
`chat-socket.service.ts` + REAL `rvb-auth.service.ts` (same
`socket.io-client` package as the browser bundle, so Manager reconnect
semantics are identical) with cookie-jar fetch + `localStorage` shim and
refresh/cookie-failure injection flags. No Playwright: the defect and fix live
entirely in service error/event handling, fully exercisable in Node with the
identical client library (spec's allowed fallback). No mocks for the socket
failure mechanism. Disposable harness removed after collection.

## 22. Valid-socket baseline

`[pbs035] B1 connected=true connects=1 cerr=0 sessions=sess-… authFp=… memFp=…`
(one handshake, correct session room, no errors).

## 23. Expired-access handshake baseline

`[pbs035] B2-expired connected=true cerr=1 sample=[msg=RVB_TOKEN_INVALID…] refresh=1 statuses=200`
Pre-existing working path: expiry → INVALID → one shared refresh → reconnect.
Unchanged post-fix (same line post-fix). Valid-token calls cause zero refresh.

## 24. Malformed-token baseline

`[pbs035] B3-malformed connected=true cerr=1 … refresh=1` — same recovery,
pre-existing and preserved.

## 25. No-token baseline

`[pbs035] B4-notoken returns=null` — `connectChatSocket()` returns null
without a memory token (does NOT attempt cookie restore). Current behavior
documented; out of 035 scope (bootstrap integration, no stale-session
involvement); unchanged.

## 26. Connected-socket rotation timeline

Pre-fix run: `B5-refresh ok … mem A1->A2 refreshHits=1` then
`B6-rotation connected=false connects=1 disconnect=["io server disconnect"] cerr=0 reattempt=0 sessions=(empty) sockAuth=A1 mem=A2 sameAsBefore=true`.
Rotation reaches the client purely as server `disconnect` — no error, no
retry, stale auth retained, singleton unchanged but dead.

## 27. Rotation final-state baseline

Pre-fix: permanently `connected=false` (12s window covering all 10 configured
attempts — zero fired), server holds no S1 socket, memory holds valid A2 that
nothing applies. Dead chat on a live session: the primary live defect.

## 28. Stale old-session handshake

`[pbs035] B7-staleOld connected=false cerr=["msg=RVB_SESSION_REVOKED data=undefined code=undefined"]`
then `[pbs035] B7-freshA2 connected=true`. Old token deterministically
rejected with message-only SESSION_REVOKED; current token connects.

## 29. New-memory-token/stale-socket-token baseline

Pre-fix: no code path compared the two (sec 18); any re-handshake with A1
while A2 valid died unhandled (B6/B7). Post-fix F4/F12 (sec 66).

## 30. Revoked-without-replacement baseline

`[pbs035] B9 connected=false cerr=1 sample=[SESSION_REVOKED] reattempt=0 refreshHits=1 hint=1`
(one handshake attempt, one terminal-failing refresh, stop; nothing
resurrected, durable state untouched). Fail-closed holds.

## 31. Archived-account baseline

Pre-fix: existing socket stays connected (no server hook — `preConn=true`);
forced re-handshake → `msg=RVB_ACCOUNT_ARCHIVED`, `cerr=1`, `reattempt=0`,
`refresh=0` (zero repeated refresh — rule 17 already satisfied pre-fix);
direct refresh → `401 RVB_TOKEN_INVALID`. Bounded single futile handshake.

## 32. Disabled-account baseline

Same as archived with `RVB_ACCOUNT_DISABLED` (`refresh=0`). No storm either.

## 33. Network-drop baseline

`[pbs035] B12 connected=true disconnect=["forced close"] reattempt=1 cerr=0 refresh=0`
Ordinary transport loss auto-reconnects via normal backoff with zero auth
refresh. The fix must not (and does not) touch this path.

## 34. Transient-refresh-500 baseline

`[pbs035] B13 connected=false cerr=1 refresh=1 statuses=500 hint=1->1`
One refresh attempt, swallowed failure, hint+session preserved (030
invariant holds inside socket recovery), no loop; later explicit
reconnect/reload can still recover. Identical pre/post (no regression).

## 35. Transient-refresh-network baseline

Covered by the same `catch {}` around the shared refresh (codeless fetch
rejection → identical stop-and-preserve path as B13; classifier never
consulted for destruction since this service never destroys). No separate run
needed beyond B13 + code-path identity.

## 36. Terminal-refresh-failure baseline

`[pbs035] B14 connected=false cerr=1 … refresh=1 hint=1` (revoked cookie +
bad token): recovery stops after the single terminal refresh; durable state
NOT cleared by the socket layer — owned by the HTTP layer on next contact
(`loadMe`/`authFetch` terminal paths, proven in PBS-BUG-030). Pre-existing
semantics, documented boundary, not a resurrection risk.

## 37. Listener-continuity baseline

Pre-fix: `B15-hits=0` on the dead post-rotation socket (nothing deliverable).
Post-fix F15/F16 (sec 68).

## 38. Duplicate-listener baseline

Pre-fix: single instance, single `onChat` registration; nothing duplicated
because nothing recovered. Post-fix proof in sec 69.

## 39. Decision-gate result

CASE 3 (rotation arrives as server `disconnect` with zero recovery — primary)
PLUS CASE 2 (stale-handshake `SESSION_REVOKED` unrecognized) → CASE 4: both
are reachable symptoms of one root cause (no socket reauth for superseded
sessions), fixed together. Terminal account codes get halt-without-refresh
(CASE-5-like stop, proven bounded pre-existing waste of exactly 1 handshake).
CASE 1 rejected: rotation death reproduced deterministically.

## 40. Exact CURRENT root cause

1. Rotation path unhandled: `safeDisconnectSession(S1)` → client
   `disconnect("io server disconnect")` → no auto-reconnect, no service
   handler → socket dead with stale A1 while memory holds valid A2.
2. Stale-handshake path unrecognized: re-handshake with superseded token →
   `connect_error RVB_SESSION_REVOKED` → old handler matched only
   TOKEN_INVALID/UNAUTHENTICATED → ignored → dead.
3. Compounding: the only prior remedy (fresh `connectChatSocket()`) replaces
   the singleton, orphaning the page's 10 bound listeners.

## 41. Exact affected event path(s)

- `disconnect` with reason `"io server disconnect"` (rotation).
- `connect_error` with `RVB_SESSION_REVOKED` (superseded-token re-handshake).
- `connect_error` with `RVB_TOKEN_INVALID`/`RVB_UNAUTHENTICATED` (kept, now
  sharing the bounded recovery instead of an unguarded refresh).

## 42. Exact unaffected path(s)

Transport-loss reconnect (B12), client-initiated disconnect/logout,
`connectChatSocket()` null-contract, creation config, all chat/notification
subscriptions, HTTP auth stack (028/029/030), backend protocol, mobile.

## 43. Fix architecture

Frontend-only, same-instance recovery in `chat-socket.service.ts`:
`socketErrorCode`/`matchesSocketCode` (structured-first, message fallback);
`recoverSocketAuth` (C1 memory fast-path → 400ms in-flight grace re-check →
C2 one shared `refresh()` → terminal stop); `recoverSocketAuthOnce`
single-flight dedupe; `failedRecoveryKey` same-state loop guard;
`haltSocketRecovery` terminal freeze. `connect_error` routes
INVALID/UNAUTHENTICATED/REVOKED to recovery and ARCHIVED/DISABLED to halt;
`disconnect` recovers ONLY on `"io server disconnect"`. No state destruction
anywhere in the service.

## 44. Current-token fast-path design

If `getAccessToken()` differs from `socket.auth.token`, adopt it and
`connect()` with zero refresh (covers post-rotation memory A2 and any
HTTP-rotated token). Re-checked after a 400ms grace so an in-flight refresh
response is reused instead of forcing S2→S3. Proven: F4/F12 `refresh=0`.

## 45. Refresh fallback design

Only when no newer memory token exists: exactly one shared
`rvbAuthService.refresh()` (028 promise, deduped across concurrent episodes
by `recoveryPromise`); success → adopt + connect; failure (transient or
terminal) → record `failedRecoveryKey`, stop, halt. Empirically ≤1 refresh
per episode in every matrix row.

## 46. Terminal account-state routing

`RVB_ACCOUNT_ARCHIVED`/`RVB_ACCOUNT_DISABLED` (and terminal refresh
outcomes): no refresh, `haltSocketRecovery`, return. Durable cleanup stays
with the HTTP layer (next `loadMe`/`authFetch` contact fails terminal per
030 and clears). No second auth system; no use of the test-only notifier.

## 47. Server-disconnect recovery

`disconnect` listener gated STRICTLY on `reason === "io server disconnect"`.
Explicit logout/manual disconnect (`"io client disconnect"`, singleton nulled)
and transport reasons bypass recovery: F16 proves logout leaves
`singleton=null`, zero refresh, no resurrection; B12 proves network drops
still use native backoff with zero refresh.

## 48. Reconnect-loop prevention

- Episodes start only from server-disconnect or connect_error (manager emits
  neither repeatedly: measured `reattempt=0`, single `cerr` per rejection).
- One shared refresh per concurrent burst (`recoveryPromise`).
- `failedRecoveryKey` stops same-state repeats.
- Terminal outcomes halt. No timers/polling; worst case burns one handshake +
  one refresh per genuinely new server rejection — empirically `cerr=1`,
  `refresh≤1` in all terminal rows.

## 49. Permanent files changed

ONLY: `H.S.H-V2.0.0/frontend/src/services/chat-socket.service.ts`
(+118 added across one file; `rvb-auth.service.ts`, context, backend, mobile,
chat UI untouched).

## 50. COMPLETE FULL BEFORE file 1

A. Path: `H.S.H-V2.0.0/frontend/src/services/chat-socket.service.ts`
B. Full before body (PRE-FIX parent `72d1fc2` blob
   `fc07fdc524de8ad1f09440b10019a53ffe76a87b`):

<!-- BLOCK:BEFORE -->
```ts
"use client";

import { io, Socket } from "socket.io-client";
import { rvbAuthService } from "./rvb-auth.service";

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
let socket: Socket | null = null;
let listenersBound = false;

export function getChatSocket(): Socket | null {
  return socket;
}

export function connectChatSocket(): Socket | null {
  const token = rvbAuthService.getAccessToken();
  if (!token) return null;
  if (socket && socket.connected) return socket;
  if (socket) {
    try { socket.disconnect(); } catch {}
    socket = null;
  }
  socket = io(API_BASE, {
    path: "/api/rvb/chats/socket",
    auth: { token },
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 800,
  });
  // Re-auth on reconnect: refresh token if needed
  (socket as any).on("connect_error", async (err: any) => {
    const msg = err?.message || "";
    if (msg.includes("RVB_TOKEN_INVALID") || msg.includes("RVB_UNAUTHENTICATED")) {
      try {
        const refreshed: any = await (rvbAuthService as any).refresh();
        if (refreshed?.accessToken) {
          (socket as any).auth = { token: refreshed.accessToken };
          (socket as Socket).connect();
        }
      } catch {}
    }
  });
  return socket;
}

export function disconnectChatSocket() {
  if (socket) {
    try { socket.disconnect(); } catch {}
    socket = null;
  }
}
```

## 51. COMPLETE FULL AFTER file 1

C. Full after body (working tree, git object
   `e65eb744ad89df6d131ec967f5508dcefb757b9a`):

<!-- BLOCK:AFTER -->
```ts
"use client";

import { io, Socket } from "socket.io-client";
import { rvbAuthService } from "./rvb-auth.service";

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
let socket: Socket | null = null;
let listenersBound = false;

// PBS-BUG-035: bounded single-flight socket auth recovery.
// A stale socket token is NOT proof the user session died: an HTTP refresh may
// already have rotated S1 -> S2 (storing A2 in memory) while this socket still
// carries A1, or one shared refresh may repair it. Terminal account/session
// states stop recovery; durable auth cleanup stays owned by the HTTP layer
// (PBS-BUG-030) — this service never destroys local auth state.
let recoveryPromise: Promise<boolean> | null = null;
let failedRecoveryKey: string | null = null;

function socketErrorCode(err: unknown): string {
  // Backend socket middleware rejects with `next(new Error(CODE))`, which the
  // client surfaces as message-only (err.data/err.code are undefined today).
  // Prefer structured codes when present; fall back to the message text.
  const e = err as { data?: { code?: unknown }; code?: unknown; message?: unknown } | null | undefined;
  const structured = e?.data?.code ?? e?.code;
  if (typeof structured === "string" && structured) return structured;
  return typeof e?.message === "string" ? e.message : "";
}

function matchesSocketCode(err: unknown, code: string): boolean {
  return socketErrorCode(err).includes(code);
}

function getSocketToken(sock: Socket): string | null {
  const a = (sock as unknown as { auth?: { token?: unknown } }).auth;
  return typeof a?.token === "string" ? a.token : null;
}

function setSocketToken(sock: Socket, token: string) {
  const s = sock as unknown as { auth?: Record<string, unknown> };
  const prev = (typeof s.auth === "object" && s.auth !== null ? s.auth : {}) as Record<string, unknown>;
  s.auth = { ...prev, token };
  try { sock.connect(); } catch {}
}

async function recoverSocketAuth(): Promise<boolean> {
  const sock = socket;
  if (!sock) return false;
  // C1 fast path: reuse an already-newer in-memory token instead of rotating again.
  const current = rvbAuthService.getAccessToken();
  const sockToken = getSocketToken(sock);
  if (current && current !== sockToken) {
    failedRecoveryKey = null;
    setSocketToken(sock, current);
    return true;
  }
  // Identical stale state already failed once -> stop instead of looping.
  const key = `${current ?? ""}||${sockToken ?? ""}`;
  if (failedRecoveryKey !== null && failedRecoveryKey === key) return false;
  // Let an in-flight HTTP refresh land first so the fast path can reuse it
  // instead of forcing a redundant S2 -> S3 rotation.
  await new Promise((r) => setTimeout(r, 400));
  if (socket !== sock) return false;
  const current2 = rvbAuthService.getAccessToken();
  const sockToken2 = getSocketToken(sock);
  if (current2 && current2 !== sockToken2) {
    failedRecoveryKey = null;
    setSocketToken(sock, current2);
    return true;
  }
  // C2 fallback: one shared refresh via the existing 028 path (never private).
  try {
    const refresher = rvbAuthService as unknown as { refresh: () => Promise<{ accessToken?: unknown }> };
    const refreshed = await refresher.refresh();
    if (socket !== sock) return false;
    if (typeof refreshed?.accessToken === "string") {
      failedRecoveryKey = null;
      setSocketToken(sock, refreshed.accessToken);
      return true;
    }
  } catch {}
  failedRecoveryKey = key;
  return false;
}

function recoverSocketAuthOnce(): Promise<boolean> {
  if (!recoveryPromise) {
    recoveryPromise = recoverSocketAuth().finally(() => { recoveryPromise = null; });
  }
  return recoveryPromise;
}

function haltSocketRecovery(soc: Socket | null) {
  // Terminal state: ensure no futile re-handshakes remain queued.
  try { soc?.disconnect(); } catch {}
}

export function getChatSocket(): Socket | null {
  return socket;
}

export function connectChatSocket(): Socket | null {
  const token = rvbAuthService.getAccessToken();
  if (!token) return null;
  if (socket && socket.connected) return socket;
  if (socket) {
    try { socket.disconnect(); } catch {}
    socket = null;
  }
  socket = io(API_BASE, {
    path: "/api/rvb/chats/socket",
    auth: { token },
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 800,
  });
  // PBS-BUG-035: socket auth recovery (same instance, so page listeners survive).
  socket.on("connect_error", async (err: unknown) => {
    const target = socket;
    if (!target) return;
    if (matchesSocketCode(err, "RVB_ACCOUNT_ARCHIVED") || matchesSocketCode(err, "RVB_ACCOUNT_DISABLED")) {
      // Terminal account state: never refresh (rule: no repeated refresh for
      // archived/disabled); halt and let the HTTP layer fail closed (030).
      haltSocketRecovery(target);
      return;
    }
    if (
      matchesSocketCode(err, "RVB_TOKEN_INVALID") ||
      matchesSocketCode(err, "RVB_UNAUTHENTICATED") ||
      matchesSocketCode(err, "RVB_SESSION_REVOKED")
    ) {
      // Recoverable-or-superseded session: reuse a newer memory token when one
      // exists, else one shared refresh; terminal refresh failure stops closed.
      const ok = await recoverSocketAuthOnce();
      if (!ok) haltSocketRecovery(socket);
      return;
    }
    // Unknown errors: keep default Socket.IO behavior (no interference).
  });
  socket.on("disconnect", (reason: string) => {
    // Session rotation (safeDisconnectSession) reaches the client as
    // "io server disconnect" with NO automatic reconnect and NO connect_error.
    // Recover on this same instance. Explicit local disconnects
    // ("io client disconnect") and transport loss keep default behavior:
    // logout must not resurrect, network drops use normal Socket.IO backoff.
    if (reason === "io server disconnect") {
      void recoverSocketAuthOnce().then((ok) => { if (!ok) haltSocketRecovery(socket); });
    }
  });
  return socket;
}

export function disconnectChatSocket() {
  if (socket) {
    try { socket.disconnect(); } catch {}
    socket = null;
  }
}
```

## 52. COMPLETE DIFF file 1

D. Literal `git diff HEAD -- <file>` (spliced byte-exact from git output; see
sec 54 method):

<!-- BLOCK:DIFF -->
```diff
diff --git a/H.S.H-V2.0.0/frontend/src/services/chat-socket.service.ts b/H.S.H-V2.0.0/frontend/src/services/chat-socket.service.ts
index fc07fdc..e65eb74 100644
--- a/H.S.H-V2.0.0/frontend/src/services/chat-socket.service.ts
+++ b/H.S.H-V2.0.0/frontend/src/services/chat-socket.service.ts
@@ -7,6 +7,93 @@ const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://
 let socket: Socket | null = null;
 let listenersBound = false;
 
+// PBS-BUG-035: bounded single-flight socket auth recovery.
+// A stale socket token is NOT proof the user session died: an HTTP refresh may
+// already have rotated S1 -> S2 (storing A2 in memory) while this socket still
+// carries A1, or one shared refresh may repair it. Terminal account/session
+// states stop recovery; durable auth cleanup stays owned by the HTTP layer
+// (PBS-BUG-030) — this service never destroys local auth state.
+let recoveryPromise: Promise<boolean> | null = null;
+let failedRecoveryKey: string | null = null;
+
+function socketErrorCode(err: unknown): string {
+  // Backend socket middleware rejects with `next(new Error(CODE))`, which the
+  // client surfaces as message-only (err.data/err.code are undefined today).
+  // Prefer structured codes when present; fall back to the message text.
+  const e = err as { data?: { code?: unknown }; code?: unknown; message?: unknown } | null | undefined;
+  const structured = e?.data?.code ?? e?.code;
+  if (typeof structured === "string" && structured) return structured;
+  return typeof e?.message === "string" ? e.message : "";
+}
+
+function matchesSocketCode(err: unknown, code: string): boolean {
+  return socketErrorCode(err).includes(code);
+}
+
+function getSocketToken(sock: Socket): string | null {
+  const a = (sock as unknown as { auth?: { token?: unknown } }).auth;
+  return typeof a?.token === "string" ? a.token : null;
+}
+
+function setSocketToken(sock: Socket, token: string) {
+  const s = sock as unknown as { auth?: Record<string, unknown> };
+  const prev = (typeof s.auth === "object" && s.auth !== null ? s.auth : {}) as Record<string, unknown>;
+  s.auth = { ...prev, token };
+  try { sock.connect(); } catch {}
+}
+
+async function recoverSocketAuth(): Promise<boolean> {
+  const sock = socket;
+  if (!sock) return false;
+  // C1 fast path: reuse an already-newer in-memory token instead of rotating again.
+  const current = rvbAuthService.getAccessToken();
+  const sockToken = getSocketToken(sock);
+  if (current && current !== sockToken) {
+    failedRecoveryKey = null;
+    setSocketToken(sock, current);
+    return true;
+  }
+  // Identical stale state already failed once -> stop instead of looping.
+  const key = `${current ?? ""}||${sockToken ?? ""}`;
+  if (failedRecoveryKey !== null && failedRecoveryKey === key) return false;
+  // Let an in-flight HTTP refresh land first so the fast path can reuse it
+  // instead of forcing a redundant S2 -> S3 rotation.
+  await new Promise((r) => setTimeout(r, 400));
+  if (socket !== sock) return false;
+  const current2 = rvbAuthService.getAccessToken();
+  const sockToken2 = getSocketToken(sock);
+  if (current2 && current2 !== sockToken2) {
+    failedRecoveryKey = null;
+    setSocketToken(sock, current2);
+    return true;
+  }
+  // C2 fallback: one shared refresh via the existing 028 path (never private).
+  try {
+    const refresher = rvbAuthService as unknown as { refresh: () => Promise<{ accessToken?: unknown }> };
+    const refreshed = await refresher.refresh();
+    if (socket !== sock) return false;
+    if (typeof refreshed?.accessToken === "string") {
+      failedRecoveryKey = null;
+      setSocketToken(sock, refreshed.accessToken);
+      return true;
+    }
+  } catch {}
+  failedRecoveryKey = key;
+  return false;
+}
+
+function recoverSocketAuthOnce(): Promise<boolean> {
+  if (!recoveryPromise) {
+    recoveryPromise = recoverSocketAuth().finally(() => { recoveryPromise = null; });
+  }
+  return recoveryPromise;
+}
+
+function haltSocketRecovery(soc: Socket | null) {
+  // Terminal state: ensure no futile re-handshakes remain queued.
+  try { soc?.disconnect(); } catch {}
+}
+
 export function getChatSocket(): Socket | null {
   return socket;
 }
@@ -28,17 +115,37 @@ export function connectChatSocket(): Socket | null {
     reconnectionAttempts: 10,
     reconnectionDelay: 800,
   });
-  // Re-auth on reconnect: refresh token if needed
-  (socket as any).on("connect_error", async (err: any) => {
-    const msg = err?.message || "";
-    if (msg.includes("RVB_TOKEN_INVALID") || msg.includes("RVB_UNAUTHENTICATED")) {
-      try {
-        const refreshed: any = await (rvbAuthService as any).refresh();
-        if (refreshed?.accessToken) {
-          (socket as any).auth = { token: refreshed.accessToken };
-          (socket as Socket).connect();
-        }
-      } catch {}
+  // PBS-BUG-035: socket auth recovery (same instance, so page listeners survive).
+  socket.on("connect_error", async (err: unknown) => {
+    const target = socket;
+    if (!target) return;
+    if (matchesSocketCode(err, "RVB_ACCOUNT_ARCHIVED") || matchesSocketCode(err, "RVB_ACCOUNT_DISABLED")) {
+      // Terminal account state: never refresh (rule: no repeated refresh for
+      // archived/disabled); halt and let the HTTP layer fail closed (030).
+      haltSocketRecovery(target);
+      return;
+    }
+    if (
+      matchesSocketCode(err, "RVB_TOKEN_INVALID") ||
+      matchesSocketCode(err, "RVB_UNAUTHENTICATED") ||
+      matchesSocketCode(err, "RVB_SESSION_REVOKED")
+    ) {
+      // Recoverable-or-superseded session: reuse a newer memory token when one
+      // exists, else one shared refresh; terminal refresh failure stops closed.
+      const ok = await recoverSocketAuthOnce();
+      if (!ok) haltSocketRecovery(socket);
+      return;
+    }
+    // Unknown errors: keep default Socket.IO behavior (no interference).
+  });
+  socket.on("disconnect", (reason: string) => {
+    // Session rotation (safeDisconnectSession) reaches the client as
+    // "io server disconnect" with NO automatic reconnect and NO connect_error.
+    // Recover on this same instance. Explicit local disconnects
+    // ("io client disconnect") and transport loss keep default behavior:
+    // logout must not resurrect, network drops use normal Socket.IO backoff.
+    if (reason === "io server disconnect") {
+      void recoverSocketAuthOnce().then((ok) => { if (!ok) haltSocketRecovery(socket); });
     }
   });
   return socket;
```

## 53. Complete before/after/diff for any additional changed file

None. `rvb-auth.service.ts` untouched (no helper exposure proved necessary);
context/backend/mobile/UI untouched.

## 54. Machine byte-verification

Method (LF-normalized): BEFORE block vs `git cat-file -p HEAD:<path>`; AFTER
block vs working-tree bytes; DIFF block vs `git diff HEAD -- <path>` bytes.
 markers `<!-- BLOCK:NAME -->` delimit fenced regions. Result (executed after
writing this file; all MUST read MATCH):

```text
BEFORE MATCH
AFTER MATCH
DIFF MATCH
```

## 55. Verification commands

- `npx tsx tmp-pbs035-harness.ts` — three runs: pre-fix baseline (sec 26-27
  dead rotation), post-fix matrix (sec 56-70), final confirmation run against
  the exact final file (identical lines). Deleted after collection.
- `npx tsc --noEmit` (frontend) — exit 0.
- `npx eslint src/services/chat-socket.service.ts` — post-fix 2 problems
  (1 error + 1 warning, both pre-existing on untouched `listenersBound`) vs
  baseline 7 (6+1). Delta: -5, no new debt.
- `npm run build` (frontend) — exit 0.
- `npm run test:hsh-sync` (backend) — 34 passed, 0 failed.
- `git diff HEAD --check` — exit 0.

## 56. Valid connection post-fix

B1 unchanged: `connected=true connects=1 cerr=0`, correct session,
`refresh=0` (implicit in B4-adjacent valid-token runs).

## 57. Expired-access post-fix

`B2-expired connected=true cerr=1 … refresh=1 statuses=200` — identical
working path, now sharing the bounded recovery (fast-path miss → single
refresh → connect).

## 58. Rotation recovery proof

`B6-rotation connected=true connects=2 disconnect=["io server disconnect"] cerr=0 … sockAuthFp=A2 memFp=A2 sameAsBefore=false` with `B6-singleton sameInstance=true`:
server disconnect → fast-path adopt A2 → reconnect on the SAME instance,
backend session = current S2, exactly 1 refresh total (the trigger), no page
reload, no redundant rotation.

## 59. SESSION_REVOKED stale-handshake proof

`F4-staleViaService connected=true newConnects=1 newCerr=1 … refresh=0 sameInstance=true`:
forced stale A1 handshake → 1× SESSION_REVOKED → fast-path A2 → connected,
zero refresh, same instance.

## 60. Revoked-no-successor proof

`B9 connected=false cerr=1 … refreshHits=1 hint=1`: single handshake attempt,
single terminal-failing refresh, stop; nothing resurrected, durable state
untouched. Fail-closed.

## 61. Archived proof

`B10 … connected=false cerr=1 … refresh=0` + direct refresh `401
RVB_TOKEN_INVALID`: no repeated refresh, halt, dead socket; durable cleanup
via HTTP layer on next contact (030 mechanism, sec 46).

## 62. Disabled proof

`B11 … refresh=0`, same as archived with `RVB_ACCOUNT_DISABLED`.

## 63. Network reconnect proof

`B12 connected=true disconnect=["forced close"] reattempt=1 cerr=0 refresh=0`:
native backoff recovery preserved; recovery logic never fires for transport
reasons (reason gate).

## 64. Transient refresh proof

`B13 … refresh=1 statuses=500 hint=1->1`: bounded single attempt, durable
state preserved, no loop; later explicit recovery still possible (instance
and singleton intact).

## 65. Terminal refresh proof

`B14 … refresh=1 hint=1`: single terminal refresh → stop + halt; no state
destruction by the socket layer (boundary documented in sec 20/46).

## 66. Current-token fast-path proof

B6 (`refresh` beyond trigger = 0, `sameAsBefore=false`) and F4 (`refresh=0`):
memory-newer token adopted directly both after server-disconnect and after
stale-handshake.

## 67. Shared-refresh/dedupe proof

Every matrix episode shows `refresh≤1` beyond its trigger (B6 total 1, F4 0,
B2/B3/B9/B13/B14 exactly 1); concurrent bursts share `recoveryPromise`
(code-level single-flight + `failedRecoveryKey` same-state guard).

## 68. Listener continuity proof

`F15-hits=1 sockConnected=true`: `chat:newMessage` listener attached BEFORE
rotation still delivers exactly once after recovery on the same instance.

## 69. No-duplicate-listener proof

`F16-dup-hits=1 … sameInstance=true` after a SECOND rotation+recovery: one
server emit → exactly one callback; recovery binds no listeners and replaces
no instance.

## 70. Explicit logout proof

`F16 after-logout connected=false singleton=null token=(null) hint=(absent) refresh=0`:
logout → disconnect → null; zero refresh, zero resurrection. HARD GATE passes.

## 71. Component cleanup proof

`disconnectChatSocket()` nulls the singleton; recovery closures read module
`socket` (null → immediate `false`) and the reason gate ignores
`"io client disconnect"`. Chats-page `off()` cleanups and shell/bell
bindings are instance-scoped and unaffected (no instance replacement in any
recovery path).

## 72. PBS-BUG-028 regression

`F18-authFetch http=200 ok=true refresh=1`: expired access → one refresh +
one retry → success. `rvb-auth.service.ts` byte-identical (not in diff).

## 73. PBS-BUG-029 regression

`restoreSessionFromCookie`/route-aware bootstrap byte-identical (not in
diff); no socket interaction with the restore path was added.

## 74. PBS-BUG-030 regression

Classifier byte-identical (not in diff). B13/B14 prove the socket layer still
preserves durable state on transient failure and stops (without clearing) on
terminal failure — identical to pre-fix socket behavior; HTTP terminal
cleanup paths (`loadMe` catch, `notifyAuthFailure`) untouched and effective
on next HTTP contact.

## 75. Chat feature regression

Event delivery proven for `chat:newMessage` (F15/F16 exactly-once); all other
subscriptions (`typing/read/reaction/pinned/unread/notification`) share the
preserved singleton instance and untouched binding code — no delivery-path
change. Typing emit paths (`getChatSocket()?.emit`) operate on the recovered
connected instance.

## 76. TypeScript result

`npx tsc --noEmit` in `H.S.H-V2.0.0/frontend`: `TSC_LASTEXIT=0`.

## 77. Lint result

Touched-file ESLint: post-fix 2 problems (1 error `prefer-const` + 1 warning
`no-unused-vars`, both pre-existing on the untouched dead `listenersBound`)
vs pre-fix baseline 7 (6+1). No new lint; net debt reduced by 5.

## 78. Production build result

`npm run build` in `H.S.H-V2.0.0/frontend`: `BUILD_LASTEXIT=0`.

## 79. HSH sync-suite result

`npm run test:hsh-sync` in `H.S.H-V2.0.0/backend`:
`=== H.S.H sync integrity: 34 passed, 0 failed ===`.

## 80. Backend/mobile scope proof

`git diff HEAD --name-only`: ONLY `chat-socket.service.ts` (+ deleted 034
audit). Zero backend changes (F26), zero `R.V.B-mobile` changes (F27).

## 81. PBS-BUG-034 preservation

`R.V.B-mobile/src/services/directory.service.ts` re-read: canonical `items`
extraction (`(res as any).items || …`) still present. Unaltered (mobile path
invisible to superproject git by gitlink construction; verified by direct
read).

## 82. git diff/status/check proof

```text
M H.S.H-V2.0.0/frontend/src/services/chat-socket.service.ts
D TEMP-PBS-BUG-034-AUDIT.md
?? TEMP-PBS-BUG-035-AUDIT.md
```
`git diff HEAD --stat`: service `+118` (single file) + audit deletion.
`git diff HEAD --check`: exit 0.

## 83. Disposable-artifact cleanup

Deleted post-evidence: `H.S.H-V2.0.0/backend/tmp-pbs035-harness.ts`. No
spec/config/playwright artifacts were created. Kept: this audit + the
single-file fix.

## 84. Remaining uncertainty

1. No Chromium/Playwright run (sec 21 rationale): identical `socket.io-client`
   Manager semantics in Node; HttpOnly cookie via jar; page-effect timing not
   browser-measured (recovery is service-level, effect-independent).
2. Rotation race (disconnect arriving before HTTP response): covered by the
   400ms re-check + shared refresh; the redundant-rotation corner was reasoned
   benign (server rotation chains; client ends on latest) but not separately
   runtime-forced.
3. Terminal socket cases leave durable `user` until next HTTP contact (sec
   46/74) — documented HTTP-owned boundary, unchanged from pre-fix.
4. `connectChatSocket()` fresh-instance replacement (and its listener-orphan
   side effect) retained for explicit re-connects; out-of-scope to redesign
   caller lifecycles in this cycle.
5. B4 null-token cold-boot (valid cookie, no memory token → no socket attempt)
   documented unchanged (sec 25).

## 85. Final status

FIXED — READY FOR GIORNO REVIEW
